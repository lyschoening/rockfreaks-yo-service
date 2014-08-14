/**
 * Created by Lars Schöning on 14/08/14.
 */


var CronJob = require("cron").CronJob;
var parseString = require("xml2js").parseString;
var request = require("request");
var redis;

if (process.env.REDISTOGO_URL) {
    var rtg = require("url").parse(process.env.REDISTOGO_URL);
    redis = require("redis").createClient(rtg.port, rtg.hostname);
    redis.auth(rtg.auth.split(":")[1]);
} else {
    redis = require("redis").createClient();
}

var USER_AGENT = 'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.16 Safari/537.36';
var YO_TOKEN = process.env.YO_TOKEN;

if(!YO_TOKEN) {
    console.error('Yo token missing, exiting.');
    process.exit(1);
}

function Yo(link, callback) {
    request.post('http://api.justyo.co/yoall/', {
        form: {
            api_token: process.env.YO_TOKEN,
            link: link
        }
    }, callback);
}

var run;
var service = new CronJob('00 */15 * * * *', run = function () {
    // Runs every 15 minutes of every day
    console.log('checking RF.net for updates');

    request.get({
        url: 'http://rockfreaks.net/rss.xml',
        headers: {
            'User-Agent': USER_AGENT // RF.net bans default User Agent for no conceivable reason.
        }
    }, function (err, res, data) {
        // {strict: false} because RF.net's built on a mëtäl pile of incredibad PHP scripts and can't do XML
        parseString(data, {strict: false}, function (err, res) {
            var articleLinks;
            try {
                articleLinks = res.RSS.CHANNEL[0].ITEM
                    .map(function (item) {
                        return item.LINK[0];
                    }).filter(function (link) {
                        return link.indexOf('/albums/') !== -1
                    })

            } catch (e) {
                console.log(e);
                return;
            }

            if (articleLinks.length) {
                console.log('found ' + articleLinks.length + ' album reviews:');

                articleLinks.forEach(function (article, i) {
                    redis.sismember(['yolinks', article], function (err, replies) {
                        if(replies == 0) {
                            console.log('(' + i + ') new article: ' + article);

                            console.log('Yo ...');
                            Yo(article, function (err, res, data) {
                                console.log('... sent for ' + article);
                            });

                            redis.sadd(['yolinks', article]);
                        } else {
                            console.log('(' + i + ') old article');
                        }
                    });
                })
            } else {
                console.log('no album reviews found');
            }
        });
    })

});

run();
service.start();
console.log('ROCKFREAKS service is running');