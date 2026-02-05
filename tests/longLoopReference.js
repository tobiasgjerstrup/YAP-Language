function timestampSeconds() {
  return Math.floor(Date.now() / 1000);
}

const args = process.argv;
if (args[2] !== "interpreted" && args[2] !== "compiled"){
    args[2] = "compiled"; // Default to compiled mode if no valid argument is provided
}

let longLoopStart = timestampSeconds();
let longLoop = 2147483647;

if (args[2] === "interpreted") {
  longLoop = Math.floor(longLoop / 50); // Shorten loop for interpret mode to avoid long test times
}

console.log(longLoop);

while (longLoop > 0) {
  longLoop = longLoop - 1;
  if (longLoop % 100000000 === 0 || (args[2] === "interpreted" && longLoop % 2000000 === 0)) {
    console.log(longLoop);
  }
}

let longLoopEnd = timestampSeconds();
let longLoopTime = longLoopEnd - longLoopStart;

if (args[2] === "interpreted") {
  longLoopTime = longLoopTime * 50; // Scale time back up for interpret mode
}

console.log("Node.js took " + longLoopTime + " seconds to complete the long loop");
