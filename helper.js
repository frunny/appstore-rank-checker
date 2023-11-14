

// color console output
function colorLog(color, text) {
    const colors = {
        "Reset": "\x1b[0m",
        "Bright": "\x1b[1m",
        "Dim": "\x1b[2m",
        "Underscore": "\x1b[4m",
        "Blink": "\x1b[5m",
        "Reverse": "\x1b[7m",
        "Hidden": "\x1b[8m",
        "Black": "\x1b[30m",
        "Red": "\x1b[31m",
        "Green": "\x1b[32m",
        "Yellow": "\x1b[33m",
        "Blue": "\x1b[34m",
        "Magenta": "\x1b[35m",
        "Cyan": "\x1b[36m",
        "White": "\x1b[37m"
    };

    // Default to white if the specified color is not found
    const colorCode = colors[color] || colors["White"];
    console.log(colorCode + text + colors["Reset"]);
}


// ----------------------------------------------------------------------------------------  
// Export the functions for use in other modules
// ----------------------------------------------------------------------------------------
export {
    colorLog
  };