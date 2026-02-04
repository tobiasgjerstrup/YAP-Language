export fn get_line(filename) {
    return read(filename);
}

export fn save_result(filename, content) {
    write(filename, content);
}
