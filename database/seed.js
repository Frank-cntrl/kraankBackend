const db = require("./db");
const { User, Photo } = require("./index");

const seed = async () => {
  try {
    db.logging = false;
    await db.sync({ force: true }); // Drop and recreate tables

    // Create the two main app users
    const users = await User.bulkCreate([
      { username: "frank", email: "frank@example.com" },
      { username: "keily", email: "keily@example.com" },
    ]);

    console.log(`👤 Created ${users.length} users`);

    // Optionally add some sample photos (without actual Cloudinary URLs)
    // These would be replaced with real uploads in production
    // const photos = await Photo.bulkCreate([
    //   {
    //     userId: "frank",
    //     imageUrl: "https://via.placeholder.com/400",
    //     caption: "Sample photo from Frank",
    //   },
    //   {
    //     userId: "keily",
    //     imageUrl: "https://via.placeholder.com/400",
    //     caption: "Sample photo from Keily",
    //   },
    // ]);
    // console.log(`📸 Created ${photos.length} photos`);

    console.log("🌱 Seeded the database");
  } catch (error) {
    console.error("Error seeding database:", error);
    if (error.message.includes("does not exist")) {
      console.log("\n🤔🤔🤔 Have you created your database??? 🤔🤔🤔");
    }
  }
  db.close();
};

seed();
