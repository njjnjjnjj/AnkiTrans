const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const buildDir = 'dist-firefox';
const zipPath = path.join(__dirname, 'AnkiTrans.zip');

// Delete existing zip
if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
}

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function () {
    console.log(`\x1b[32mFirefox extension package successfully created: AnkiTrans.zip (${archive.pointer()} total bytes)\x1b[0m`);
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

// Append files from a sub-directory, putting its contents at the root of archive
archive.directory(buildDir, false);

// The 'archiver' library normalizes to POSIX separators automatically
archive.finalize();
