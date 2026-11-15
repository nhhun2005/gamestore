"""Add the requested UI sample catalog through existing catalog procedures.

Uses the configured application DB; never edits accounts, wallet funds, purchases
or existing games. Run with --owner <verified administrator username>.
Requires PyYAML and psql (the local test runtime is detected automatically).
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, urlparse

import yaml

ROOT = Path(__file__).resolve().parent.parent


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def connection(config_path, psql_override):
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    ds = config["spring"]["datasource"]

    def resolve(value):
        def replace(match):
            name, fallback = match.group(1), match.group(2)
            if name in os.environ:
                return os.environ[name]
            if fallback is not None:
                return fallback
            raise ValueError(f"Missing environment variable {name}")
        return re.sub(r"\$\{([^}:]+)(?::([^}]*))?\}", replace, str(value))

    url = urlparse(resolve(ds["url"]).removeprefix("jdbc:"))
    if url.scheme != "postgresql" or not url.hostname or not url.path.lstrip("/"):
        raise ValueError("Expected a PostgreSQL datasource URL")
    bundled = ROOT / "target/pg-runtime/pgsql/bin/psql.exe"
    psql = psql_override or shutil.which("psql") or (str(bundled) if bundled.exists() else None)
    if not psql:
        raise ValueError("psql not found; supply --psql <path>")
    env = os.environ.copy()
    env["PGPASSWORD"] = resolve(ds["password"])
    env["PGCONNECT_TIMEOUT"] = "15"
    env["PGCLIENTENCODING"] = "UTF8"
    env["PGSSLMODE"] = parse_qs(url.query).get("sslmode", ["disable" if url.hostname in ("localhost", "127.0.0.1") else "require"])[0]
    args = [psql, "-X", "-h", url.hostname, "-p", str(url.port or 5432), "-U", resolve(ds["username"]), "-d", url.path.lstrip("/"), "-v", "ON_ERROR_STOP=1", "-tA"]
    return args, env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--config", type=Path, default=ROOT / "src/main/resources/application.yaml")
    parser.add_argument("--psql")
    opts = parser.parse_args()
    games = json.loads((ROOT / "scripts/sample-catalog.json").read_text(encoding="utf-8"))
    if len(games) != 10 or len({g["title"].casefold() for g in games}) != 10:
        raise ValueError("Expected exactly ten unique sample titles")
    blocks = []
    for game in games:
        genre_statements = []
        for genre in game["genres"]:
            genre_statements.append(f"""
                SELECT id INTO genre_id FROM public.genres WHERE lower(btrim(name))=lower({quote(genre)}) LIMIT 1;
                IF genre_id IS NULL THEN CALL public.sp_create_genre(actor,{quote(genre)},'Thể loại trò chơi',genre_id); END IF;
                genres:=array_append(genres,genre_id);
            """)
        cover = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{int(game['steam_app_id'])}/header.jpg"
        blocks.append(f"""
            IF NOT EXISTS(SELECT 1 FROM public.games WHERE lower(btrim(title))=lower({quote(game['title'])})) THEN
                genres:=ARRAY[]::UUID[];
                {''.join(genre_statements)}
                CALL public.sp_create_game(actor,{quote(game['title'])},{quote(game['description'])},
                    {quote(game['price'])}::NUMERIC,{quote(cover)},'1.0',genres,NULL,'AVAILABLE',game_id);
                added:=added+1;
            END IF;
        """)
    # One transaction, serialized against another seed run; catalog procedures
    # retain their own role/genre/content validation and advisory locks.
    sql = f"""
    BEGIN;
    SELECT pg_advisory_xact_lock(hashtext('gamestore.sample-catalog'));
    DO $seed_catalog$
    DECLARE actor TEXT:={quote(opts.owner)}; genre_id UUID; genres UUID[]; game_id UUID; added INTEGER:=0;
    BEGIN
        PERFORM public.fn_huan_actor(actor,ARRAY['ADMINISTRATOR']);
        {''.join(blocks)}
        RAISE NOTICE 'Sample catalog: % games added; existing titles preserved.',added;
    END;
    $seed_catalog$;
    SELECT title,status,price,cover_image_url FROM public.games WHERE lower(title) IN
        ({','.join(quote(g['title'].lower()) for g in games)}) ORDER BY title;
    COMMIT;
    """
    args, env = connection(opts.config, opts.psql)
    result = subprocess.run(args, input=sql, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    if result.returncode:
        # Deliberately omit connection credentials and the connection command.
        raise RuntimeError("Catalog seed failed; transaction rolled back. " + result.stderr[:1000])
    print(result.stdout.strip())
    for line in result.stderr.splitlines():
        if "Sample catalog:" in line:
            print(line)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
