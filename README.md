# SiteLink
## Message to mysql database discord bot
The purpose of this bot is to dump the messages sent in a chat channel of discord to a MySQL database, with content, time, id, sender id, attachments links and image links all separated.

## Features
 - Dump messages to mySQL database
 - Scalable, this bot is able to work across multiple servers at the same time, with the same code running and can be configured all from the config file
 - Auto extraction of attachments that are passed as json elements to the database
 - Include time stamp and id of the message
 - Able to choose if to send the id, username or tag of the author of the message according to what's needed
 - Able to choose if to send the id, username or tag of the users mentioned in the message according to what's needed
 - Able to choose if to send the id or name of the channel mentioned in the message according to what's needed
 - Able to choose if to send the id, name or name with color of the roles mentioned in the message according to what's needed
 - Able to dump messages that have been sent while the bot was offline with slash command, and an argument can be passed to limit the number of messages checked (limited and by default 100)
 - Able to disable dump command on each channel individually
 - Update data in the database if someone edits a message with dedicated value in the database
 - Able to choose if to ignore bots
 - Supports partial

 ## How to set up
  1. First make sure that you have the latest version of [NodeJS](https://nodejs.org/en/) and [MySQL](https://www.mysql.com/) installed.
  2. Run this command in a command prompt to install all the libraries required to run the code: `npm install` .
  3. Create your bot on the [developer portal on the discord website](https://discordapp.com/developers).
  4. Copy the example config to `config.json` and configure as detailed below.

  |Setting|Description|
  |--|--|
  |`clientId`|Discord API client ID (found on the developer portal)|
  |`token`|Discord API bot token (found on the developer portal)|
  |`prefix`|The prefix that will be used to trigger commands|
  |`playing`|Sets the playing status|
  |`admins`|Array of user IDs who will be able to use the special commands|
  |`channels`|Array of configured channels|
  |`channels.id`|ID of Discord channel to listen to|
  |`channels.userMentionsMode`| Conversion settings for user mentions in Discord messages. 0 will set as the user ID, e.g. `@182925154211332097`. 1 will set as just the username, e.g. `@Owen`. ~~2 will set as just the in-server nickname, e.g. `@Not Owen`~~. 3 will set as the username + discriminator, e.g. `@Owen#1111` 4 will set as the user ID plus end marker, e.g. `@182925154211332097@`. ~~5~~Anything else will set as just the username plus end marker, e.g. `@Owen@`. ~~Anything else will set as just the in-server nickname plus end marker e.g. `@Not Owen@`.~~|
  |`channels.channelMentionsMode`| Conversion settings for channel mentions in Discord messages. 0 will set as the channel ID, e.g. `#224558110868635658`. 1 will set as the name, e.g. `#rules`. 2 will set the id in between two hastag, e.g. `#224558110868635658#`. Anything else will the channel name between two hastag, e.g. `#rules#`.|
  |`channels.roleMentionsMode`| Conversion settings for role mentions in Discord messages. 0 will set as the role ID, e.g. `&677081843086000128`. 1 will set as just the name of the role, e.g. `&foo`. Anything else will set as the name + color in hex, e.g. `&foo#ffffff`|
  |`channels.authorMode`|Conversion settings for the author of the message. 0 will set as the user ID, e.g. `@182925154211332097`. 1 will set as just the username, e.g. `@Owen`. 2 will set as the username + discriminator, e.g. `@Owen#1111`. Anything will set just the in-server nickname, e.g. `@Not Owen`.|
  |`channels.allowBots`|Filters out bot messages if false |
  |`channels.allowDump`|Toggle dumping in a channel|
  |`channels.dbHost`|MySQL database host|
  |`channels.dbUser`|MySQL database username|
  |`channels.dbPassword`|MySQL database password|
  |`channels.db`|MySQL database to store data in|
  |`channels.dbTable`|MySQL database table to store data in|

 
  5. Connect your bot to your guild, by entering thE link `https://discordapp.com/oauth2/authorize?client_id={YOUR BOT ID}scope=bot&permissions=8`.
  6. Setup the MySQL database table with the following query, replacing "TABLE_NAME" as appropriate. 
  ```
  CREATE TABLE `TABLE_NAME` (
  `id` varchar(18) NOT NULL,
  `message` longtext NOT NULL,
  `author` text NOT NULL,
  `images` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `edited_at` timestamp NOT NULL DEFAULT current_timestamp()
) COLLATE 'utf8mb4_unicode_ci';
```
  7. Start the bot by running ` node index.js ` or ` nodemon `
  8. Congratulation, your bot is up and running!

## To do stuff
 - Automatically delete from database if message is removed on Discord
 - Add example code of usage
 - Support more than 1 page/100 messages when dumping
 - Re-add user mentions nickname support

 ## If any problem comes up or something please open an issue on github

 Have a great life!
