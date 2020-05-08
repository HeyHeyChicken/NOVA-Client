const LIBRARIES = {
    FS: require("fs"),
    Path: require("path"),
    HTTPS: require("https"),
    HTTP: require("http")
};

class FS {
    // Cette fonction liste les fichiers d'un dossier et de ses sous-dossiers.
    static readdirSync(_path, _array){
        _array = _array || [];

        LIBRARIES.FS.readdirSync(_path).forEach(function(file) {
            if (LIBRARIES.FS.statSync(_path + "/" + file).isDirectory()) { // recurse
                _array = FS.readdirSync(_path + "/" + file, _array);
            } else { // add file
                _array.push(LIBRARIES.Path.join(_path, "/", file));
            }
        })

        return _array;
    }

    // Cette fonction supprime un dossier.
    static rmdirSync(_path) {
        if (LIBRARIES.FS.existsSync(_path)) {
            LIBRARIES.FS.readdirSync(_path).forEach((file, index) => {
                const curPath = LIBRARIES.Path.join(_path, file);
                if (LIBRARIES.FS.lstatSync(curPath).isDirectory()) { // recurse
                    FS.rmdirSync(curPath);
                } else { // delete file
                    LIBRARIES.FS.unlinkSync(curPath);
                }
            });
            LIBRARIES.FS.rmdirSync(_path);
        }
    };

    // Cette fonction télécharge le fichier présent sur l'URL demandée et le dépose au chemin demandé.
    static downloadFile(_url, _destination, _main, _callback){
        const FILE = LIBRARIES.FS.createWriteStream(_destination);
        let lib = null;
        if(_url.startsWith("https://")){
            lib = LIBRARIES.HTTPS;
        }
        else{
            lib = LIBRARIES.HTTP;
        }
        lib.get(_url, function(_response) {
            // TODO : Gérer le cas 404.
            if ([301, 302].indexOf(_response.statusCode) > -1 ) {
                FS.downloadFile(_response.headers.location, _destination, _main, _callback);
                return;
            }
            _response.pipe(FILE);
            FILE.on("finish", function() {
                FILE.close(_callback);  // close() is async, call the callback after close completes.
            });
        }).on("error", function(err) { // Handle errors
            _main.Log(err.message, "red");
            LIBRARIES.FS.unlink(_destination, function(){}); // Delete the file async. (But we don't check the result
            if (_callback !== undefined){
                _callback(err.message);
            }
        });
    }
}

module.exports = FS;
