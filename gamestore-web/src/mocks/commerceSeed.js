import { demoUsers } from "../services/session.js";
export const gameId = (n) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const otherDeveloper = "10000000-0000-4000-8000-000000000004";
const promoId = "30000000-0000-4000-8000-000000000001";
const data = [
  [
    "Cyberpunk Odyssey 2077",
    "490000.00",
    1091500,
    "Nhập vai",
    "Thành phố tương lai, những lựa chọn thay đổi số phận và một hành trình mang dấu ấn của riêng bạn.",
  ],
  [
    "Elden Chronicles",
    "850000.00",
    1245620,
    "Hành động",
    "Bước vào vùng đất huyền bí, khám phá những bí mật cổ xưa và vượt qua các thử thách sử thi.",
  ],
  [
    "Pixel Valley Farming",
    "165000.00",
    413150,
    "Mô phỏng",
    "Rời nhịp sống thành thị, chăm sóc nông trại và bắt đầu một cuộc sống mới trong thung lũng yên bình.",
  ],
  [
    "Black Myth: Legends",
    "1299000.00",
    2358720,
    "Phiêu lưu",
    "Khám phá thế giới thần thoại phương Đông với những trận chiến ngoạn mục.",
  ],
  [
    "Celeste",
    "0.00",
    504230,
    "Platformer",
    "Chinh phục ngọn núi và vượt qua chính mình trong cuộc phiêu lưu đầy thử thách.",
  ],
  [
    "Dự án sắp ra mắt",
    "220000.00",
    null,
    "Phiêu lưu",
    "Trò chơi đang được phát triển và hiện chưa mở bán.",
  ],
];
export function createSeed() {
  return {
    version: 2,
    users: [
      ...demoUsers,
      { id: otherDeveloper, username: "Ember Games", role: "DEVELOPER" },
    ].map((u) => ({ ...u, balance: "100000.00", status: "VERIFIED" })),
    games: data.map(([title, price, art, genre, description], index) => ({
      id: gameId(index + 1),
      title,
      price,
      description,
      genre,
      developer_id:
        index === 0 || index === 2 || index === 5
          ? demoUsers[1].id
          : otherDeveloper,
      cover_image_url: art
        ? `https://cdn.akamai.steamstatic.com/steam/apps/${art}/header.jpg`
        : null,
      status: index === 5 ? "HIDDEN" : "AVAILABLE",
      promotion_id: index === 0 ? promoId : null,
      rating: null,
    })),
    promotions: [
      {
        id: promoId,
        name: "Khám phá thế giới mới",
        discount: "25",
        status: "ENABLED",
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        discount: "50",
        status: "DISABLED",
      },
    ],
    transactions: [],
    game_bought: [],
    reviews: [],
    wishlist: [],
  };
}
