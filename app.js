const express = require("express");
const app = express();
app.use(express.json());
let port = 3001;

const path = require("path");
const databasePath = path.join(__dirname, "twitterClone.db");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let database = null;

const initializeDBServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(port, () => {
      console.log(`Server Running at http://localhost:${port}/`);
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBServer();

//Authenticator
const authenticator = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers.authorization;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "qaiewovcbeoknv765vslf", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const jsonToObjResponse = (jsonResponse) => {
  return {
    username: jsonResponse.username,
    tweet: jsonResponse.tweet,
    dateTime: jsonResponse.date_time,
  };
};

//API-1: Register User
app.post("/register/", async (request, response) => {
  try {
    const { username, name, password, gender } = request.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const searchUserExistenceQuery = `
    SELECT * 
    FROM user
    WHERE username = '${username}';`;
    const dbUserDetails = await database.get(searchUserExistenceQuery);
    if (dbUserDetails === undefined) {
      if (password.length >= 6) {
        const createUserQuery = `
        INSERT INTO 
            user (username,password,name,gender)
        VALUES 
            (
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
            );`;
        await database.run(createUserQuery);
        response.send("User created successfully");
      } else {
        response.status(400);
        response.send("Password is too short");
      }
    } else {
      response.status(400);
      response.send("User already exists");
    }
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

//API-2: Login User

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  let jwtToken = null;
  let payload = { username: username };
  const searchUserExistenceQuery = `
    SELECT * 
    FROM user
    WHERE username = '${username}';`;
  const dbUserDetails = await database.get(searchUserExistenceQuery);
  if (dbUserDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatching = await bcrypt.compare(
      password,
      dbUserDetails.password
    );
    if (isPasswordMatching === true) {
      jwtToken = jwt.sign(payload, "qaiewovcbeoknv765vslf");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3: Returns the latest tweets of people
//whom the user follows. Return 4 tweets at a time

app.get("/user/tweets/feed/", authenticator, async (request, response) => {
  try {
    const { username } = request;
    const getFollowerUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let follower = await database.get(getFollowerUserIdQuery);
    //console.log(follower);
    const getTweetsQuery = `
        SELECT username,tweet,date_time
        FROM follower INNER JOIN tweet ON
        follower.following_user_id = tweet.user_id INNER JOIN
        user ON tweet.user_id = user.user_id 
        WHERE follower.follower_user_id = ${follower.user_id}
        GROUP BY tweet_id
        ORDER BY date_time DESC
        LIMIT 4;`;
    const tweets = await database.all(getTweetsQuery);
    response.send(tweets.map((eachObj) => jsonToObjResponse(eachObj)));
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

//API-4: Returns the list of all names of people whom the user follows

app.get("/user/following/", authenticator, async (request, response) => {
  try {
    const { username } = request;
    const getFollowerUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let follower = await database.get(getFollowerUserIdQuery);
    //console.log(follower);
    const getFollowingUsersQuery = `
        SELECT name
        FROM follower INNER JOIN user ON
        follower.following_user_id = user.user_id
        WHERE follower.follower_user_id = ${follower.user_id};`;
    const following = await database.all(getFollowingUsersQuery);
    console.log(following);
    response.send(following.map((eachObj) => ({ name: eachObj.name })));
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

//API-5: Returns the list of all names of people who follows the user

app.get("/user/followers/", authenticator, async (request, response) => {
  try {
    const { username } = request;
    const getFollowingUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let following = await database.get(getFollowingUserIdQuery);
    //console.log(follower);
    const getFollowersQuery = `
        SELECT name
        FROM follower INNER JOIN user ON
        follower.follower_user_id = user.user_id
        WHERE follower.following_user_id = ${following.user_id};`;
    const followers = await database.all(getFollowersQuery);
    response.send(followers.map((eachObj) => ({ name: eachObj.name })));
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});
//**need to check */
//API-6: Returns If the user requests a tweet of the user he is following,
// return the tweet, likes count, replies count and date-time..
//else If the user requests a tweet other than the users he is following invalid

app.get("/tweets/:tweetId/", authenticator, async (request, response) => {
  try {
    const { tweetId } = request.params;
    const { username } = request;
    const getFollowerUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let follower = await database.get(getFollowerUserIdQuery);
    //console.log(follower);
    const getTweetsLikesQuery = `
        SELECT tweet,COUNT(like_id),COUNT(reply_id),date_time
        FROM user natural join tweet
        natural join like natural join reply
        inner join follower on following_user_id = user.user_id
        WHERE follower_user_id = ${follower.user_id}
            AND tweet_id = ${tweetId} ;`;
    const tweetStats = await database.get(getTweetsLikesQuery);
    if (tweetStats.tweet === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        tweet: tweetStats.tweet,
        likes: tweetStats["COUNT(like_id)"],
        replies: tweetStats["COUNT(reply_id)"],
        dateTime: tweetStats.date_time,
      });
    }
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

//API-7: Returns If the user requests a tweet of the user he is following,
// return the tweet, likes count, replies count and date-time..
//else If the user requests a tweet other than the users he is following invalid

app.get("/tweets/:tweetId/likes/", authenticator, async (request, response) => {
  try {
    const { tweetId } = request.params;
    const { username } = request;
    const getFollowerUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let follower = await database.get(getFollowerUserIdQuery);
    //console.log(follower);
    const getTweetLikedUserQuery = `
        SELECT username
        FROM user natural join tweet
        natural join like natural join reply
        inner join follower on following_user_id = user.user_id
        WHERE follower_user_id = ${follower.user_id};`;
    const tweetStats = await database.all(getTweetLikedUserQuery);
    //response.send(tweetStats.username);
    if (tweetStats === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let namesList = tweetStats.filter(
        (eachObj) => eachObj.username !== undefined
      );
      console.log(namesList);
      response.send(namesList);
    }
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

//API-10: Create a tweet in the tweet table

app.post("/user/tweets/", authenticator, async (request, response) => {
  try {
    const { tweet } = request.body;
    const { username } = request;
    const getUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let follower = await database.get(getUserIdQuery);
    const createUserTweetQuery = `
    INSERT INTO 
            tweet (tweet,user_id)
        VALUES 
            ('${tweet}',
            ${follower.user_id});`;
    await database.run(createUserTweetQuery);
    response.send("Created a Tweet");
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

//API-11: If the user deletes his tweet else if
//user requests to delete a tweet of other users Invalid

app.delete("/tweets/:tweetId/", authenticator, async (request, response) => {
  try {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}' ;`;
    let follower = await database.get(getUserIdQuery);

    const searchTweetQuery = `
        SELECT * 
        FROM tweet 
        WHERE user_id = ${follower.user_id} 
        AND tweet_id = ${tweetId};`;
    const isTweetFound = await database.get(searchTweetQuery);
    if (isTweetFound === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteUserTweetQuery = `
        DELETE FROM 
        tweet WHERE 
        tweet_id = ${isTweetFound.tweet_id};`;
      const queryResult = await database.run(deleteUserTweetQuery);
      await database.run(deleteUserTweetQuery);
      response.send("Tweet Removed");
    }
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
});

module.exports = app;
