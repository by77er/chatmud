# Chatmud
Chatmud is a package that makes it extremely easy for you to interact with the `hackmud` chat api.

[Here](https://www.hackmud.com/forums/general_discussion/chat_api_documentation) is a link to the "official" chat API documentation.

## What's Included:
- An easy-to-use `Api` object that has clearly named promise-based methods for interacting with and receiving raw answers from the official chat API.
- A simple (currently barebones) `Bot` object that provides a polling loop and an `EventEmitter` for all of your chat-event-handling needs.

## Installation

```bash
npm install chatmud
# or, if you prefer yarn,
yarn add chatmud
```

## Example `chatmud.Api` Usage

Need to convert a `chat_pass` into a `token`?

```js
(new require('chatmud').Api(null)).getToken('your-pass').then(console.log);
```

```js
const chatmud = require('chatmud');

const token = 'your-token-here';

const api = new chatmud.Api(token);

api.getAccountData()
    .then((data) => {
      const users = Object.keys(data.users);
      console.log(`Found users: ${JSON.stringify(users)}`);
      // assuming the first user is in #0000
      return api.createChat(users[0], 'Hello!', '0000');
    })
    .then(() => {
      console.log('Sent chat message.');
    })
    .catch((err) => {
      console.error(err);
    });
```
## Example `chatmud.Bot` Usage

```js
const chatmud = require('chatmud');

const token = 'your-token-here';

// The parameter is optional - it specifies which
// users' chats are polled for updates.
// (default is all users)
const bot = new chatmud.Bot(['bot-user']);

bot.on('login', (data) => {
  const users = JSON.stringify(Object.keys(data));
  console.log(`Logged in with users: ${users}`);
});

bot.on('message', (message) => {
  console.log(message.author.name, ':', message.cleanContent());
  if (message.content == 'ping') {
    // reply() handles tells, too!
    message.reply(`@${message.author.name}, pong`);
  }
});

bot.on('error', (err) => {
  console.error(err);
});

bot.login(token);
```

Happy hacking!
