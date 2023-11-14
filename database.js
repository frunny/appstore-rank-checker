// database.js

import sqlite3 from 'sqlite3';
import readline from 'readline';
import { colorLog } from './helper.js';


// ----------------------------------------------------------------------------------------
// connect to local sqlite 
// ----------------------------------------------------------------------------------------
const { verbose } = sqlite3;
const db = new (verbose().Database)('./mydb.sqlite3', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Unable to connect to the SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// ----------------------------------------------------------------------------------------
// init database tables 
// ----------------------------------------------------------------------------------------
const initDb = () => {
  return new Promise((resolve, reject) => {
      console.log('Initializing database tables...');

      db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS apps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              app_id TEXT NOT NULL,
              app_name TEXT NOT NULL,
              app_country TEXT NOT NULL,
              app_keywords TEXT NOT NULL
          );`, (err) => {
              if (err) {
                  console.error('Error creating apps table:', err.message);
                  return reject(err);
              }
              console.log('Apps table created successfully.');

              db.run(`CREATE TABLE IF NOT EXISTS keywords (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  app_id INTEGER NOT NULL,                  
                  keyword TEXT NOT NULL,
                  country_code TEXT NOT NULL,
                  FOREIGN KEY (app_id) REFERENCES apps (id)
              );`, (err) => {
                  if (err) {
                      console.error('Error creating keywords table:', err.message);
                      return reject(err);
                  }
                  console.log('Keywords table created successfully.');

                  db.run(`CREATE TABLE IF NOT EXISTS scans (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      keyword_id INTEGER NOT NULL,
                      app_id INTEGER NOT NULL,
                      ranking_position INTEGER,
                      date_of_scan DATE,
                      FOREIGN KEY (keyword_id) REFERENCES keywords (id),
                      FOREIGN KEY (app_id) REFERENCES apps (id)
                  );`, (err) => {
                      if (err) {
                          console.error('Error creating scans table:', err.message);
                          return reject(err);
                      }
                      console.log('Scans table created successfully.');
                      resolve();
                  });
              });
          });
      });
  });
};

// ----------------------------------------------------------------------------------------
// insert a keyword scan with results
// ----------------------------------------------------------------------------------------
const insertScan = (selectedApp, keyword, country_code, ranking_position, callback) => {
  const getKeywordIdSql = `SELECT id FROM keywords WHERE app_id = ? AND keyword = ? AND country_code = ?`;
  
// console.log("** selectedApp.id = " + selectedApp.id + " / app_id = " + selectedApp.app_id + " / app_name = " + selectedApp.app_name)

  db.get(getKeywordIdSql, [selectedApp.id, keyword, country_code], (err, row) => {
    if (err) {
      return callback(err);
    }
    if (row) {
      // Keyword exists
      insertOrUpdateScan(selectedApp, row.id, ranking_position, callback);
    } else {
      // Keyword doesn't exist, insert it
      const insertKeywordSql = `INSERT INTO keywords (app_id, keyword, country_code) VALUES (?, ?, ?)`;

      db.run(insertKeywordSql, [selectedApp.id, keyword, country_code], function (err) {
        if (err) {
          return callback(err);
        }
        // Keyword inserted, now insert the scan
        insertOrUpdateScan(selectedApp, this.lastID, ranking_position, callback);
      });
    }
  });
};

function insertOrUpdateScan(selectedApp, keywordId, ranking_position, callback) {
  const getLastRankSql = `SELECT ranking_position FROM scans WHERE app_id = ? AND keyword_id = ? ORDER BY date_of_scan DESC LIMIT 1`;

  db.get(getLastRankSql, [selectedApp.id, keywordId], (err, row) => {
    if (err) {
      return callback(err);
    }
    if (row && row.ranking_position === ranking_position) {
      // Last rank is the same, no need to insert
      callback(null, { skipped: true });
    } else {
      // Insert new scan
      const insertScanSql = `INSERT INTO scans (app_id, keyword_id, ranking_position, date_of_scan) VALUES (?, ?, ?, datetime('now'))`;

      db.run(insertScanSql, [selectedApp.id, keywordId, ranking_position], function (err) {
        if (err) {
          return callback(err);
        }
        callback(null, { id: this.lastID, app_id: selectedApp.id, keyword_id: keywordId, ranking_position });
      });
    }
  });
}

  
// ----------------------------------------------------------------------------------------
// Function to insert a new app
// ----------------------------------------------------------------------------------------
function insertApp(appId, appName, appCountry, appKeywords, callback) {
  const insertAppSql = `INSERT INTO apps (app_id, app_name, app_country, app_keywords) VALUES (?, ?, ?, ?)`;

  db.run(insertAppSql, [appId, appName, appCountry, appKeywords], function (err) {
      if (err) {
          return callback(err);
      }
      callback(null, { id: this.lastID, app_id: appId, app_name: appName, app_country: appCountry, app_keywords: appKeywords });
  });
}



function updateAppKeywords(appId, newKeywords, callback) {
  const updateSql = `UPDATE apps SET app_keywords = ? WHERE id = ?`;
  db.run(updateSql, [newKeywords, appId], function (err) {
    if (err) {
      return callback(err);
    }
    callback(null);
  });
}



// Function to fetch and display apps from the database
function fetchAndDisplayApps(callback) {
  const sql = 'SELECT * FROM apps;';
  db.all(sql, [], (err, rows) => {
      if (err) {
          console.error('Error fetching apps:', err.message);
          return callback(err);
      }
      if (rows.length === 0) {
          colorLog("Red", 'No apps found. Please add an app first.');
          // console.log('No apps found. Please add an app first.');
          return callback(null, null);
      }
      console.log('\n\nAvailable apps:');
      rows.forEach((row, index) => {
          console.log(`${index + 1}) ${row.app_name} (ID: ${row.app_id} Country: ${row.app_country})`);
      });
      callback(null, rows);
  });
}

// ----------------------------------------------------------------------------------------
// Function to dump all keywords with dates and rankings
// ----------------------------------------------------------------------------------------
const dumpKeywordsWithRankings = (selectedApp, callback) => {

  const sql = `
    SELECT 
      k.keyword,
      s.date_of_scan,
      s.ranking_position
    FROM 
      keywords AS k
    INNER JOIN 
      scans AS s ON k.id = s.keyword_id
    WHERE 
      k.app_id = ? AND s.app_id = ?
    ORDER BY 
      k.keyword ASC, 
      s.date_of_scan DESC;
  `;

  db.all(sql, [selectedApp.id, selectedApp.id], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
};


function getKeywordsWithNoRankings(selectedApp, callback) {
  // Check if selectedApp.keywords is a string and split it into an array
  const keywordsArray = selectedApp.keywords ? selectedApp.keywords.split(',') : [];

  // Fetch all keywords from the database for this app
  db.all(`SELECT keyword FROM keywords WHERE app_id = ?`, [selectedApp.id], (err, rows) => {
    if (err) {
      console.error('SQL Error:', err);
      return callback(err);
    }

    // Convert the rows to a list of keyword strings
    const dbKeywords = rows.map(row => row.keyword.trim());

    // Filter the expected keywords to find which ones are not in the database
    const keywordsWithNoRanking = keywordsArray.filter(keyword => !dbKeywords.includes(keyword.trim()));

    console.log('Keywords with no rankings:', keywordsWithNoRanking);
    callback(null, keywordsWithNoRanking);
  });
}






// ----------------------------------------------------------------------------------------
// Function to clear all data from tables
// ----------------------------------------------------------------------------------------
const clearDb = (callback) => {
    db.serialize(() => {
      // Clear all records from tables
      db.run(`DELETE FROM keywords;`, function(err) {
        if (err) {
          return callback(err);
        }
        console.log('Cleared keywords table.');
      });
  
      db.run(`DELETE FROM scans;`, function(err) {
        if (err) {
          return callback(err);
        }
        console.log('Cleared scans table.');
      });
  
      // Reset the autoincrement keys
      db.run(`DELETE FROM sqlite_sequence WHERE name='keywords';`, function(err) {
        if (err) {
          return callback(err);
        }
        console.log('Reset autoincrement key for keywords table.');
      });
  
      db.run(`DELETE FROM sqlite_sequence WHERE name='scans';`, function(err) {
        if (err) {
          return callback(err);
        }
        console.log('Reset autoincrement key for scans table.');
        callback(null);
      });
    });
  };


  
// ----------------------------------------------------------------------------------------  
// Export the functions for use in other modules
// ----------------------------------------------------------------------------------------
export {
    initDb,
    insertScan,
    dumpKeywordsWithRankings,
    clearDb,
    insertApp,
    fetchAndDisplayApps,
    updateAppKeywords,
    getKeywordsWithNoRankings
  };
