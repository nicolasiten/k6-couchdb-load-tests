import http from 'k6/http';
import encoding from 'k6/encoding';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import exec from "k6/execution";
import { SharedArray } from 'k6/data';

///////
// PREPARATION
// RUN in current directory: curl -u user:password -o article.json http://ip:5984/wiki_articles/_all_docs
///////

// ramping-vus executor
export const options = {
  thresholds: {
    'http_req_failed{scenario:default}': [{ threshold: 'rate<0.01', abortOnFail: true }], // http errors should be less than 1%
    'http_req_duration{scenario:default}': [{ threshold: 'p(95)<1000', abortOnFail: true }], // 95% of requests should be below 1s
  },
  stages: [
    { duration: '5m', target: 1000 }, // ramp up to large load
  ],      
  setupTimeout: '2m'
};

const ip = '<ip>';
const username = '';
const password = '';
const encodedCredentials = encoding.b64encode(`${username}:${password}`);
const authOptions = {
    headers: {
        Authorization: `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json'
    },
};

const articlePayloads = new SharedArray('articlePayloads', function () {
  const articleArray = [];

  // generate random article payloads
  for (let i = 0; i < 10000; i++) {
    const article = generateRandomWikArticlePayload();
    articleArray.push(article);
  }
  return articleArray;
});

const existingArticles = new SharedArray('existingArticles', function () {
  const articleArray = [];

  // read id and rev from file
  const jsonRows = JSON.parse(open('./article.json')).rows;
  for (let i = 0; i < jsonRows.length; i++) {
    articleArray.push({id: jsonRows[i].id, rev: jsonRows[i].value.rev});
  }

  return shuffle(articleArray);
});

export default function () {
  // 30% of times create new doc
  // 60% of times update existing
  // 10% of times delete existing
 
  let mod = exec.scenario.iterationInTest % 10; 
  if (mod < 3) {    
    // create new document
    const article = articlePayloads[Math.floor(Math.random()*articlePayloads.length)];  
    http.post(`http://${ip}:5984/wiki_articles`, article, authOptions);  
  } else if (mod < 9) {    
    // update existing document      
    let itemToUpdate = existingArticles[exec.scenario.iterationInTest]; // get entry to update
    const article = articlePayloads[Math.floor(Math.random()*articlePayloads.length)];
    authOptions.headers["If-Match"] = itemToUpdate.rev;
    http.put(`http://${ip}:5984/wiki_articles/${itemToUpdate.id}`, article, authOptions);           
  } else {
    // delete existing document
    let itemToDelete = existingArticles[exec.scenario.iterationInTest]; // get entry to delete
    authOptions.headers["If-Match"] = itemToDelete.rev;
    http.del(`http://${ip}:5984/wiki_articles/${itemToDelete.id}?rev=${itemToDelete.rev}`, null, authOptions);           
  }
}

function generateRandomWikArticlePayload() {
  const title = generateRandomWords(getRandomIntBetween(5, 20));
  const keywords = title.split(' ');
  let wikiDoc = {
    title: title,
    keywords: keywords,
    articleId: Math.floor((Math.random() * 10000)),
    'versions': [
      {        
        'id': Math.floor((Math.random() * 1000000)).toString(),
        'timeStamp': new Date().toISOString(),
        'contributors': [
          {
            'id': Math.floor((Math.random() * 10000)).toString(),
            'username': generateRandomWords(2)
          }
        ],
        'comment': generateRandomWords(getRandomIntBetween(1, 30)),
        'model': 'wikitext',
        'format': 'text/x-wiki',
        'text': generateRandomWords(getRandomIntBetween(500, 2000))
      }
    ]
  };

  return JSON.stringify(wikiDoc);
}

function generateRandomWords(noOfWords) {
  let text = '';

  for (let i = 0; i < noOfWords; i++) {
    // generate random word with length between 5 and 10
    if (text !== '')
      text = text + ' ';

    text = text + randomString(getRandomIntBetween(5, 10));
  }

  return text;
}

function getRandomIntBetween(lower, upper) {
  return Math.floor(Math.random() * (upper - lower + 1) + lower); 
}

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex > 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}