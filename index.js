/* eslint-disable require-jsdoc */
const EventEmitter = require('events');
const request = require('request');


const baseUrl = 'hackmud.com';


module.exports.Api = function(token) {
  this.token = token;
  this.getToken = (pass) => {
    return postRequest(`https://${baseUrl}/mobile/get_token.json`, {pass});
  };
  this.getAccountData = () => {
    return postRequest(`https://${baseUrl}/mobile/account_data.json`,
        {chat_token: this.token});
  };
  this.getChats = (usernames, before, after) => {
    return postRequest(`https://${baseUrl}/mobile/chats.json`,
        {chat_token: this.token, usernames, before, after});
  };
  this.createChat = (sender, msg, channel) => {
    return postRequest(`https://${baseUrl}/mobile/create_chat.json`,
        {chat_token: this.token, username: sender, channel, msg});
  };
  this.createTell = (sender, msg, recipient) => {
    return postRequest(`https://${baseUrl}/mobile/create_chat.json`,
        {chat_token: this.token, username: sender, tell: recipient, msg});
  };
  return this;
};

function postRequest(uri, json) {
  return new Promise((resolve, reject) => {
    request({method: 'POST', uri, json}, (err, _, body) => {
      if (err) {
        reject(err);
      } else {
        if (body.ok) {
          resolve(body);
        } else {
          if (body.error) {
            reject(new Error(body.error));
          } else if (body.msg) {
            reject(new Error(body.msg));
          } else {
            reject(new Error(
                'An unknown error occurred while communicating with the API'
            ));
          }
        }
      }
    });
  });
}

// Represents one of your users in terms of the API
module.exports.User = function(name, api, channels) {
  this.name = name;
  this.api = api;
  this.channels = channels || {};
  this.addChannel = (channel) => {
    channel.user = this;
    this.channels[channel.name] = channel;
  };
  // just takes a name
  this.removeChannel = (name) => {
    delete this.sentiences[name];
  };
  return this;
};


// represents a single chat message
module.exports.Message = function(author, content, timestamp, id) {
  this.author = author;
  this.content = content;
  this.timestamp = timestamp;
  this.id = id;
  this.cleanContent = () => {
    return this.content.replace(/(`[a-z,A-Z,0-9]?)/g, '');
  };
  // returns promise
  this.reply = (msg) => {
    if (!this.author.channel) { // dm
      return this.author.sendMessage(msg);
    } else { // regular
      return this.author.channel.sendMessage(msg);
    }
  };
};

// Represents other ingame users
// A sentience might not always be in a channel!
// Each sentience has a User reference for DMs.
module.exports.Sentience = function(name, channel, user) {
  this.name = name;
  this.channel = channel || null;
  this.user = user || null;
  // returns a promise
  this.sendMessage = (msg) => {
    return this.user.api.createTell(this.user.name, msg, this.name);
  };
  return this;
};

// represents a chat channel
module.exports.Channel = function(name, user, sentiences) {
  this.name = name;
  this.user = user || {};
  this.sentiences = sentiences || {};
  // takes a Sentience object
  this.addSentience = (sentience) => {
    sentience.channel = this;
    this.sentiences[sentience.name] = sentience;
  };
  // just takes a name
  this.removeSentience = (name) => {
    delete this.sentiences[name];
  };
  // returns a Promise
  this.sendMessage = (msg) => {
    return this.user.api.createChat(this.user.name, msg, this.name);
  };
};

module.exports.Bot = function(names) {
  this.api = null; // internal api object
  this.users = null; // user objects
  this.names = names || null; // just the user names for this.poll()
  this.buffer = []; // message history
  this.lastPoll = null; // time of last poll
  this.emitter = new EventEmitter();
  this.login = (token) => {
    this.api = new module.exports.Api(token);
    this.api.getAccountData()
        .then((data) => {
          // get this account's users' names, all by default
          if (!this.names) {
            this.names = Object.keys(data.users);
          }
          this.users = {};
          // add each user to our users
          for (const [name, channels] of Object.entries(data.users)) {
            if (this.names.indexOf(name) == -1) {
              continue; // skip if we don't care about this user
            }
            const user = new module.exports.User(name, this.api);
            // add each channel to user
            for (const [chan, sentiences] of Object.entries(channels)) {
              const channel = new module.exports.Channel(chan, user);
              // add each sentience to channel
              for (const sName of sentiences) {
                const sent = new module.exports.Sentience(sName, null, user);
                channel.addSentience(sent);
              }
              user.addChannel(channel);
            }
            this.users[user.name] = user;
          }
          this.emitter.emit('login', this.users);
          setInterval(() => {
            this.poll();
          }, 5100);
        })
        .catch((err) => {
          this.emitter.emit('error', err);
        });
  };
  this.poll = () => {
    if (!this.lastPoll) {
      this.lastPoll = (new Date()).getTime() / 1000;
      return;
    }
    const thisPoll = (new Date()).getTime() / 1000;
    this.api.getChats(this.names, undefined, this.lastPoll)
        .then((resp) => {
          // fire events as necessary
          for (const [user, chats] of Object.entries(resp.chats)) {
            const joins = {};
            const leaves = {};
            // get each message from each user
            for (const chat of chats) {
              // relies on message order
              if (chat.is_join || chat.is_leave) {
                if (chat.is_join) { // joined
                  const newSentience = new module.exports
                      .Sentience(chat.from_user, null, this.users[user]);
                  this.users[user].channels[chat.channel]
                      .addSentience(newSentience);
                  // cancel joins and leaves out
                  if (leaves[newSentience.name]) {
                    delete leaves[newSentience.name];
                  } else {
                    joins[newSentience.name] = newSentience;
                  }
                  // this.emitter.emit('join', newSentience);
                } else { // left
                  const oldSentience = this.users[user].channels[chat.channel]
                      .sentiences[chat.from_user];
                  // cancel joins and leaves out
                  if (joins[oldSentience.name]) {
                    delete joins[oldSentience.name];
                  } else {
                    leaves[oldSentience.name] = oldSentience;
                  }
                  // this.emitter.emit('leave', oldSentience);
                  delete this.users[user].channels[chat.channel]
                      .sentiences[chat.from_user];
                }
              } else {
                const author = new module.exports.Sentience();
                // add user reference
                author.user = this.users[user];
                author.name = chat.from_user;
                if (chat.channel) { // in a channel
                  author.channel = this.users[user].channels[chat.channel];
                } else { // direct message
                  author.channel = null;
                }

                const message = new module.exports.Message();
                message.author = author;
                message.content = chat.msg;
                message.timestamp = chat.timestamp;
                message.id = chat.id;
                let duplicate = false;
                for (let prev_msg of this.buffer) {
                  if (prev_msg.id == message.id) { // duplicate message
                    duplicate = true;
                    break;
                  }
                }
                if (!duplicate) {
                  this.emitter.emit('message', message);
                  this.buffer.push(message);
                  if (this.buffer.length > 500) {
                    this.buffer.shift();
                  }
                }
              }
            }
            // eslint-disable-next-line no-unused-vars
            for (const [_, sent] of Object.entries(leaves)) {
              this.emitter.emit('leave', sent);
            }
            // eslint-disable-next-line no-unused-vars
            for (const [_, sent] of Object.entries(joins)) {
              this.emitter.emit('join', sent);
            }
          }
        })
        .catch((err) => {
          this.emitter.emit('error', err);
        });
    this.lastPoll = thisPoll;
  };
  this.on = (event, callback) => {
    this.emitter.on(event, callback);
  };
};
