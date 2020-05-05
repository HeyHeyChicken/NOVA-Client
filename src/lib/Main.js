const LIBRARIES = {
  Express: require("express"),
  HTTP: require("http"),
  SocketIOServer: require("socket.io"),
  SocketIOClient: require("socket.io-client"),
  FS: require("fs"),
  OS: require("os"),
  NodeCMD: require("node-cmd"),
  SQLite3: require("sqlite3").verbose(),
  ChildProcess: require("child_process"),
  VM: require("vm"),

  Message: require("./Message")
};

class Main {
  constructor(_dirname, _launcher) {
    const SELF = this;

    this.DirName = _dirname;
    this.Launcher = _launcher;
    this.Settings = JSON.parse(LIBRARIES.FS.readFileSync(this.DirName + "/settings.json", "utf8"));
    this.ServerState = false;
    this.Express = null;
    this.HTTP = null;
    this.IOServer = null;
    this.IOClient = null;
    this.IOServerClients = {};
    this.WaitingForHotWord = false;
    this.DataBase = null;
    this.Language = null;
    this.ClientSkillsPublic = {}; // Cet objet va contenir l'arbre des fichiers provenant des skills destinés à la GUI des clients.

    if(this.Settings.ClientID === null){
      this.Settings.ClientID = new Date().getTime();
      LIBRARIES.FS.writeFileSync(_dirname + "/settings.json", JSON.stringify(this.Settings, null, 4), "utf8");
    }

    this.InitialiseDataBase();
    this.InitialiseServers();
    //this.LaunchChrome();
  }

  // Cette fonction permet de lancer automatiquement Google Chrome sur l'URL du client.
  LaunchChrome(hide = false) {
    const SELF = this;

  	let command = this.Settings.ChromeExecutablePath + " http://localhost:" + this.Settings.WebServerPort;
  	command += " --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required";
  	if(hide === true){
  		command += " --window-size=0,0";
  	}
    console.log(command);
  	LIBRARIES.ChildProcess.exec(command);
  }

  // Cette fonction initialise la base de donnée et créée les tables si besoin.
  InitialiseDataBase(){
    const SELF = this;

    const DATA_BASE_FILE_NAME = this.DirName + "/sqlite.db";
    const BOOL = !LIBRARIES.FS.existsSync(DATA_BASE_FILE_NAME);
    SELF.DataBase = new LIBRARIES.SQLite3.Database(DATA_BASE_FILE_NAME);
    if (BOOL) {
      SELF.DataBase.serialize(function() {
        SELF.DataBase.run("CREATE TABLE Messages (ID INT, Content TEXT, Date TEXT, FromServer INT)");
      });
    }
  }

  // Cette fonction initialise le serveur web du client NOVA.
  InitialiseServers(){
    const SELF = this;

    this.Express = LIBRARIES.Express(); // On initialise Express.
    this.Express.set("view engine", "ejs"); // On utilise le moteur de rendu "Pug" pour nos vues.
    this.Express.set("views", SELF.DirName + "/views");
    this.Express.use("/", LIBRARIES.Express.static(SELF.DirName + "/public")); // On défini un dossier public.
    this.Express.get("/", function(req, res){
      res.render("index");
    });
    this.HTTP = LIBRARIES.HTTP.createServer(this.Express);
    this.InitialiseSocketClient();
    this.InitialiseSocketServer();
    this.HTTP.listen(SELF.Settings.WebServerPort, function(){
      SELF.Log("The client is listening you.", "green");
      SELF.Log("You can access the GUI on http://localhost:" + SELF.Settings.WebServerPort + ".", "green");
    });
  }

  // Cette fonction initialise la connexion socket avec le serveur NOVA.
  InitialiseSocketServer(){
    const SELF = this;

    this.IOClient = LIBRARIES.SocketIOClient(this.Settings.ServerURL);

    // Lorsque le serveur du client se connecte au serveur central.
    this.IOClient.on("connect", function(){
      SELF.IOClient.emit("add_client", SELF.Settings.ClientID);
      SELF.ServerState = true;
      SELF.Log("You are connected to the NOVA server.", "green");
      if(SELF.IOServer.sockets !== undefined){
        SELF.IOServer.sockets.emit("server_state", SELF.ServerState, SELF.Settings.ServerURL);
      }
    });

    // Lorsque le serveur du client se déconnecte au serveur central.
    this.IOClient.on("disconnect", function(){
      SELF.ServerState = false;
      SELF.Log("You are disconnected to the NOVA server.", "red");
      if(SELF.IOServer.sockets !== undefined){
        SELF.IOServer.sockets.emit("server_state", SELF.ServerState, SELF.Settings.ServerURL);
      }
    });

    // Lorsque le serveur central envoie un message au client.
    this.IOClient.on("sc_message", function(_message){
      const SC_MESSAGE = new LIBRARIES.Message(_message.Content, _message.FromServer, _message.Date).Insert(SELF.DataBase);
      if(SELF.IOServer.sockets !== undefined){
        SELF.IOServer.sockets.emit("sc_message", SC_MESSAGE);
      }
    });

    // Lorsque le serveur central envoie un son à jouer au client.
    this.IOClient.on("play_audio", function(_audios) {
      for(let index = 0; index < _audios.length; index++) {
        if(_audios[index].URL.startsWith("/")) {
          _audios[index].URL = SELF.Settings.ServerURL + _audios[index].URL;
        }
      }
      SELF.IOServer.emit("play_audio", _audios);
    });

    // Lorsque le serveur central demande au client d'ouvrir une URL.
    this.IOClient.on("open", function(_url) {
      SELF.IOServer.emit("open", _url);
    });

    // Lorsque le serveur central change la langue.
    this.IOClient.on("set_language", function(_language) {
      SELF.Language = _language;
      SELF.IOServer.emit("set_language", _language);
    });

    // Lorsque le serveur central envoie la liste des fichers publics des skills
    this.IOClient.on("set_skills_public_files", function(_files) {
      SELF.ClientSkillsPublic = _files;
      SELF.IOServer.emit("set_skills_public_files", _files);

      // On charge les codes à executer côté serveur.
      for(let skill in _files){
        LIBRARIES.HTTP.get(SELF.Settings.ServerURL + "/" + skill + "/client.js",
        function(res) {
          let code = "";
          res.on("data", d => {
            code += d;
          })
          res.on("end", () => {
            if(res.statusCode === 200){
              LIBRARIES.VM.runInContext(code, LIBRARIES.VM.createContext({
                _main: SELF
              }));
            }
          });
        });
      }
    });
  }

  // Cette fonction initialise la connexion socket avec l'interface web du client.
  InitialiseSocketClient(){
    const SELF = this;

    this.IOServer = LIBRARIES.SocketIOServer(this.HTTP);
    this.IOServer.on("connection", function(socket){
      const TOKEN = socket.client.conn.id;
      SELF.IOServerClients[TOKEN] = socket;

      // On envoie la liste des fichiers public des skills
      SELF.IOServer.emit("set_language", SELF.Language);

      // On envoie la liste des fichiers public des skills
      SELF.IOServer.emit("set_skills_public_files", SELF.ClientSkillsPublic);

      // On envoie l'état de connection au serveur à l'utilisateur.
      socket.emit("server_state", SELF.ServerState, SELF.Settings.ServerURL);

      // On récupère les anciens messages pour les afficher à l'utilisateur.
      SELF.DataBase.all("SELECT * FROM Messages", [], (err, rows) => {
        if (err) {
          throw err;
        }
        socket.emit("set_messages", rows);
      });

      // Lorsque l'utilisateur envoie un message au serveur, on lui redirige.
      socket.on("cs_message", function(_message){
        _message = _message.charAt(0).toUpperCase() + _message.slice(1);
        const CS_MESSAGE = new LIBRARIES.Message(_message, false).Insert(SELF.DataBase);
        SELF.IOServer.sockets.emit("cs_message", CS_MESSAGE);
        SELF.IOClient.emit("cs_message", CS_MESSAGE);
      });

      // Lorsque l'utilisateur fait une demande directe au serveur, on lui redirige.
      socket.on("server", function(_message){
        SELF.IOClient.emit("server", _message);
      });

      socket.on("wait_wake_word", function(_message){
        SELF.WaitWakeWord();
      });








      // Si l'utilisateur commence a parler et que le serveur doit initialiser son enregistreur de son.
      socket.on("start_recording", function(_data){
        socket.emit("start_stt");
        SELF.IOClient.emit("start_recording", _data);
      });

      // L'utilisateur est en train de parler, on envoie le flux audio de sa voix au serveur NOVA.
      socket.on("write_audio", function(_data){
        SELF.IOClient.emit("write_audio", _data);
      });

      // Si l'utilisateur a fini de parler.
      socket.on("end_recording", function(){
        SELF.IOClient.emit("end_recording");
      });
    });
  }

  // Cette fonction lance l'écoute en local du mot clé.
  WaitWakeWord(){
    const SELF = this;

    const PY_PATH = "./python/" + LIBRARIES.OS.type() + "/demo.py";

    if(SELF.WaitingForHotWord === false){
      if(LIBRARIES.FS.existsSync(PY_PATH)){
        SELF.IOServer.sockets.emit("stop_stt");
        SELF.Log("Waiting for hot word ...", "green");
        SELF.WaitingForHotWord = true;
        LIBRARIES.NodeCMD.get(
          "python " + PY_PATH + " ./python/jarvis.pmdl",
          function(err, data, stderr){
            SELF.WaitingForHotWord = false;
            if (!err) {
              SELF.Log("Hot word detected !", "green");
              SELF.IOServer.sockets.emit("start_stt");
            } else {
              console.log("error", err)
            }
          }
        );
      }
    }
  }

  // Cette fonction remplace le "console.log"
  Log(_text, _color = "white", _header = "NOVA CLIENT"){
    if(this.Launcher !== undefined){
      this.Launcher.Log(_text, _color, _header);
    }
    else{
      console.log(_text);
    }
  }
}

module.exports = Main;