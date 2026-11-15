package gamestore_backend.modules.database;

import gamestore_backend.modules.commerce.CommerceException;
import java.sql.*;
import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** CALL participates in the service transaction; UUID arrays are JDBC SQL arrays. */
@Component
public class ProcedureCalls {
    private final JdbcTemplate jdbc;
    public ProcedureCalls(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public UUID uuid(String procedure,Object... args) { return execute(procedure,true,args); }
    public void call(String procedure,Object... args) { execute(procedure,false,args); }
    private UUID execute(String procedure,boolean output,Object[] args) {
        if (!procedure.matches("sp_[a-z_]+")) throw new IllegalArgumentException("Invalid procedure name");
        var placeholders=new ArrayList<>(Collections.nCopies(args.length,"?"));
        if(output) placeholders.add("NULL");
        String sql="CALL public."+procedure+"("+String.join(",",placeholders)+")";
        try {
            return jdbc.execute((ConnectionCallback<UUID>) connection->{
                List<java.sql.Array> arrays=new ArrayList<>();
                try(var statement=connection.prepareStatement(sql)) {
                    for(int i=0;i<args.length;i++) {
                        if(args[i] instanceof UUID[] values) {
                            var array=connection.createArrayOf("uuid",values); arrays.add(array); statement.setArray(i+1,array);
                        } else statement.setObject(i+1,args[i]);
                    }
                    boolean result=statement.execute();
                    if(output && result) try(var rows=statement.getResultSet()) {
                        if(rows.next()) return rows.getObject("p_id",UUID.class);
                    }
                    if(output) throw new SQLException("Procedure returned no id");
                    return null;
                } finally { for(var array:arrays) array.free(); }
            });
        } catch(DataAccessException error) {
            for(Throwable cause=error;cause!=null;cause=cause.getCause()) if(cause instanceof SQLException sqlError) {
                HttpStatus status=switch(Objects.toString(sqlError.getSQLState(),"")) {
                    case "G0400" -> HttpStatus.BAD_REQUEST;
                    case "G0401" -> HttpStatus.UNAUTHORIZED;
                    case "G0402" -> HttpStatus.PAYMENT_REQUIRED;
                    case "G0403" -> HttpStatus.FORBIDDEN;
                    case "G0404" -> HttpStatus.NOT_FOUND;
                    case "G0409" -> HttpStatus.CONFLICT;
                    default -> null;
                };
                if(status!=null) {
                    // The first line is our controlled business message; omit PL/pgSQL context.
                    String message=sqlError.getMessage().split("\\n",2)[0].replaceFirst("^ERROR: ","");
                    throw new CommerceException(status,message);
                }
            }
            throw error;
        }
    }
}
