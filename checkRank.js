/*
  $ node checkrank 
  
  Returns ranks with given keywords, appStoreCountry and AppId
  Will store into sqlite db with keywords and scans 

  Andreas Schneider 11/2023 
  https://x.com/sometimesfrunny 
*/

import axios from 'axios';
import readline from 'readline';
import { initDb, dumpKeywordsWithRankings, insertScan, insertApp, fetchAndDisplayApps, updateAppKeywords,getKeywordsWithNoRankings } from './database.js';
import { colorLog } from './helper.js';
import { escape } from 'querystring';

// Create a readline interface to read user input from menu
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// itunes search base url 
const searchUrl = `https://itunes.apple.com/search`;

// https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html#//apple_ref/doc/uid/TP40017632-CH5-SW1

// Start the application
async function startApp() {
  console.log('\n\n\x1b[33m** Welcome to AppStore Rank Checker! **\x1b[0m');
  try {
      // Initialize the database and tables
      await initDb();
      // show the menu
      showMenu();
  } catch (error) {
      console.error('Failed to initialize database:', error.message);
      process.exit(1);
  }
}

startApp();


// Function to display the menu
function showMenu() {
  console.log('\nMenu:');
  console.log('1) Add an App');
  console.log('2) Select App to run Ranking Check');
  console.log('3) Edit App Keywords');
  console.log('4) Show App Ranking');
  console.log('5) Exit');
  rl.question('Enter your choice: ', (choice) => {
    switch (choice) {
      case '1':
        addApp();
        break;
      case '2':
        selectApp();
        break;
      case '3':
        editAppKeywords();
        break;
      case '4':
        showAppRanking()
        break
      case '5':
        rl.close();
        break;
      default:
        console.log('Invalid choice. Please enter a valid option.');
        showMenu();
    }
  });
}




// ----------------------------------------------------------------------------------------
async function getAppRanking(keyword, appStoreCountry, selectedApp) {
  try {

    // Create the parameters object. Axios will handle the rest of the parameters.
    const params = {
      term: keyword, // Only the keyword needs to be encoded here.
      country: appStoreCountry,
      entity: 'software',
      limit: 200,
      nocache: new Date().getTime() // A cache-busting parameter
    };

    // Perform the GET request with axios
    const response = await axios.get(searchUrl, { params });

    // Log the final URL for debugging purposes
    // console.log(`Final URL: ${response.request.res.responseUrl}`);

    const apps = response.data.results;
    const appIndex = apps.findIndex(app => app.trackId.toString() === selectedApp.app_id);

    if (appIndex !== -1) {
      console.log(`Found with "${keyword}" at rank => ${appIndex + 1}`);
      insertScan(selectedApp, keyword, appStoreCountry, appIndex + 1, (err, result) => {
        if (err) {
          console.error(' > Error inserting scan:', err);
        } else if (result.skipped) {
          colorLog("Blue", ' => Scan was skipped, same ranking as last time.');
          // console.log(' > Scan was skipped, same ranking as last time.');
        } else {
          // new rank found - insert into scans db 
          console.log(" => \x1b[33mNew Rank!\x1b[0m")
          // console.log(' > New Rank! Scan inserted with ID:', result.id);
        }
      });  
    } else {
      console.log(`Not found with "${keyword}"`);
    }
  } catch (error) {
    console.error(`Error fetching App Store data for "${keyword}":`, error.message);
  }
}



// ----------------------------------------------------------------------------------------
async function checkMultipleSearchTerms(selectedApp) {
  // Split by comma and then trim whitespace from each keyword
  const keywords = selectedApp.app_keywords.split(',').map(keyword => keyword.trim());
  const appStoreCountry = selectedApp.app_country;

  console.log(`\nChecking ranks for "${selectedApp.app_name}" (${appStoreCountry})\nKeywords: ${keywords.join(', ')}\n\n`);
  for (const keyword of keywords) {
      await getAppRanking(keyword, appStoreCountry, selectedApp);
  }
  console.log("------------------------------------------------------------------")

  // print data 
  printKeywordData(selectedApp)
}



function printKeywordData(selectedApp) {
  dumpKeywordsWithRankings(selectedApp, (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }

    if (rows.length === 0) {
      console.log(`No keywords or scans found for "${selectedApp.app_name}".`);
      // show menu again 
      showMenu();
      return;
    }

    // Group the rows by keyword
    const groupedByKeyword = rows.reduce((acc, row) => {
      // Initialize the array if this keyword hasn't been added to the accumulator yet
      if (!acc[row.keyword]) {
        acc[row.keyword] = [];
      }
      acc[row.keyword].push(row);
      return acc;
    }, {});

    console.log("Keyword Ranking Data : " + selectedApp.app_name + " (" + selectedApp.app_country + ")");
    console.log("------------------------------------------------------------------");

    // Iterate over the groups and print them
    for (const [keyword, scans] of Object.entries(groupedByKeyword)) {
      console.log(`"${keyword}"`);
      // Sort scans by date in ascending order
      scans.sort((a, b) => new Date(a.date_of_scan) - new Date(b.date_of_scan));
      scans.forEach((scan, index) => {
        let color = 'white'; // Default color
        if (index > 0) {
          // If the current rank is better (smaller) than the previous rank, color it green
          if (scan.ranking_position < scans[index - 1].ranking_position) {
            color = 'green';
          // If the current rank is worse (larger) than the previous rank, color it red
          } else if (scan.ranking_position > scans[index - 1].ranking_position) {
            color = 'red';
          }
        }
        colorLog2(`\tScan: ${scan.date_of_scan}, Rank: ${scan.ranking_position}`, color);
      });
      console.log("------------------------------------------------------------------");
    }

    // show menu again 
    showMenu();
  });
}


function colorLog2(message, color) {
  const colorCodes = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  };

  const colorCode = colorCodes[color] || colorCodes.white;
  console.log(colorCode, message, colorCodes.reset);
}


// function printKeywordData(selectedApp) {
//   dumpKeywordsWithRankings(selectedApp, (err, rows) => {
//     if (err) {
//       console.error(err);
//       return;
//     }

//     if (rows.length === 0) {
//       // If no rows are returned, display a message
//       console.log(`No keywords or scans found for "${selectedApp.app_name}" ("${selectedApp.app_name}").`);
//     } else {
//       let currentKeyword = '';
//       console.log("Keyword Ranking Data : " + selectedApp.app_name + " (" + selectedApp.app_country + ")")
//       console.log("------------------------------------------------------------------")

//       rows.forEach(row => {
//         if (row.keyword !== currentKeyword) {
//           // Print the keyword header when we encounter a new keyword
//           console.log(`"${row.keyword}"`);
//           currentKeyword = row.keyword;
//         }
//         // Print the scan data for the keyword
//         console.log(`\tScan: ${row.date_of_scan}, Rank: ${row.ranking_position}`);
//       });
//       console.log("------------------------------------------------------------------")
//     }

//     // show menu again 
//     showMenu();
//   });
// }



// Function to handle adding an app
function addApp() {
  rl.question('Enter app ID: ', (appId) => {
    rl.question('Enter app name: ', (appName) => {
      rl.question('Enter app country: ', (appCountry) => {
        rl.question('Enter app keywords (comma-separated): ', (appKeywords) => {
          insertApp(appId, appName, appCountry, appKeywords, (err, result) => {
            if (err) {
              console.error('Error inserting app:', err.message);
            } else {
              console.log(`App added successfully with ID ${result.id}`);
            }
            showMenu();
          });
        });
      });
    });
  });
}

function showAppRanking() {
  fetchAndDisplayApps((err, apps) => {
    if (err || !apps) {
        showMenu();
        return;
    }
    rl.question('\nSelect an app number to see ranking data: ', (number) => {
        const appIndex = parseInt(number, 10) - 1;
        if (appIndex >= 0 && appIndex < apps.length) {
            const selectedApp = apps[appIndex];
            console.log(`\nYou selected "${selectedApp.app_name}" (${selectedApp.app_country})\n`);
            printKeywordData(selectedApp)
        } else {
            colorLog("Red", 'Invalid selection. Please try again.\n')
            selectApp();
        }
    });
});
} 




function editAppKeywords() {
  fetchAndDisplayApps((err, apps) => {
    if (err || !apps) {
      console.log('Error fetching apps or no apps available.');
      showMenu();
      return;
    }

    rl.question('Enter the number of the app to edit: ', (number) => {
      const appIndex = parseInt(number, 10) - 1;
      if (appIndex >= 0 && appIndex < apps.length) {
        const selectedApp = apps[appIndex];
        console.log(`Current keywords for "${selectedApp.app_name}": ${selectedApp.app_keywords}`);
        console.log('Enter new keywords (or press enter to keep current):');
        rl.question('> ', (newKeywords) => {
          newKeywords = newKeywords.trim() ? newKeywords : selectedApp.app_keywords;
          updateAppKeywords(selectedApp.id, newKeywords, (err) => {
            if (err) {
              console.error('Error updating app keywords:', err.message);
            } else {
              console.log(`Keywords updated for "${selectedApp.app_name}".`);
            }
            showMenu();
          });
        });
      } else {
        console.log('Invalid selection.');
        editAppKeywords();
      }
    });
  });
}


// Function to handle app selection for rank check
function selectApp() {
  fetchAndDisplayApps((err, apps) => {
      if (err || !apps) {
          showMenu();
          return;
      }
      rl.question('\nSelect an app number to run the rank check: ', (number) => {
          const appIndex = parseInt(number, 10) - 1;
          if (appIndex >= 0 && appIndex < apps.length) {
              const selectedApp = apps[appIndex];
              console.log(`\nYou selected "${selectedApp.app_name}" / ("${selectedApp.app_country}") : running rank check now...\n`);
              checkMultipleSearchTerms(selectedApp)
                  .then(() => {
                    colorLog("Green", 'Rank check completed.\n\n')
                  })
                  .catch(err => {
                      colorLog("Red", 'Error during rank check:', err.message)
                    // console.error('Error during rank check:', err.message);
                      showMenu();
                  });
          } else {
              colorLog("Red", 'Invalid selection. Please try again.\n')
              selectApp();
          }
      });
  });
}






// Handle close event
rl.on('close', () => {
  console.log('Goodbye!');
  process.exit(0);
});