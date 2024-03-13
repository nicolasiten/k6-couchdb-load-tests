import http from 'k6/http';
import encoding from 'k6/encoding';
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
    },
};

const existingArticles = new SharedArray('existingArticles', function () {
  const articleArray = [];

  // read id and rev from file
  const jsonRows = JSON.parse(open('./article.json')).rows;
  for (let i = 0; i < jsonRows.length; i++) {
    articleArray.push({id: jsonRows[i].id, rev: jsonRows[i].value.rev});
  }

  return shuffle(articleArray);
});

const searchKeywords = new SharedArray('searchKeywords', function () {
  return ["difficult", "node", "aquarium", "city", "accident", "variable", "palace", "franchise", "whip", "dribble", "chicken", "switch", "skin", "genetic", "identity", "hospital", "college", "cord", "mechanical", "taxi"];
});

export default function () {
  // 90% of times search document by id
  // 10% of times search documents by keyword 

  let mod = exec.scenario.iterationInTest % 10; 
  if (mod < 9) {    
    let documentId = existingArticles[exec.scenario.iterationInTest]; // get random documentId
    http.get(`http://${ip}:5984/wiki_articles/${documentId.id}`, authOptions);
  } else {    
    let keyword = searchKeywords[Math.floor(Math.random()*searchKeywords.length)]; // get random keyword
    http.get(`http://${ip}:5984/wiki_articles/_design/wiki_articles_by_keyword/_view/wiki_articles_by_keyword?key=%22${keyword}%22&limit=10&stable=false&update=lazy`, authOptions);
  }
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