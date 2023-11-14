// clearDbScript.js
import { clearDb } from './database.js';

clearDb((err) => {
  if (err) {
    console.error('Error clearing database:', err.message);
    process.exit(1); // Exit with an error code
  } else {
    console.log('Database cleared successfully.');
    process.exit(0); // Exit with a success code
  }
});