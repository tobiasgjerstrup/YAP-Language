var filename = "output.txt";
var content = "Hello from YAP Language!";

write(filename, content);
print("File written successfully");

var line = read(filename);
print(line);

append(filename, " [APPENDED]");
print("Appended to file");
