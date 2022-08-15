class Main {
    constructor() {
        const SELF = this;

        this.RequestStartDate = null;
        this.AverageDifferenceToCut = 40;
        this.MaximumTimeOfARequest = 15 * 1000;
        this.Volumes = [];
        this.VolumeAverages = [];
        this.Socket = io();
        this.Volume = new Volume(100);
        this.App = new Vue({
            el: "#app",
            created() {
                window.addEventListener("keydown", (e) => {
                    if (e.code === "F1") {
                        SELF.App.PresentationMode = !SELF.App.PresentationMode;
                    }
                });
            },
            data: {
                Dictionary: {},
                settings: {},
                PresentationMode: false,
                skillsPublicFiles: {},
                server: {
                    state: false,
                    url: null
                },
                theme: "",
                messages: [],
                input: "",
                DoneTutorial: null,
                language: null,
                AlreadyConnected: false,
                firstUpdate: true,
                firstAudioInit: true
            },
            updated() {
              SELF.ScrollDown();

              if(this.firstUpdate){
                if(window.location.hostname.includes("gitpod.io")){
                  if(!SELF.App.settings.ServerURL.includes("gitpod.io")){
                    console.log(SELF.App.settings.ServerURL);
                    const SPLITTER = "-";
                    const SPLIT = window.location.hostname.split(SPLITTER);
                    SPLIT[0] = "8080";
                    const URL = SPLIT.join(SPLITTER);

                    //SELF.Socket.emit("set_server_url", URL);
                  }
                }

                // On ajoute les fichiers CSS et JS des skills.
                if(document.getElementsByClassName("dynamic_file").length === 0){
                    for(let skill in this.skillsPublicFiles){
                        for(let i = 0; i < this.skillsPublicFiles[skill].length; i++){
                            const SPLIT = this.skillsPublicFiles[skill][i].split("/");
                            if(SPLIT.length > 2){
                                if(SPLIT[SPLIT.length - 1].endsWith(".css")){
                                    let style = document.createElement("link");
                                    style.setAttribute("class", "dynamic_file");
                                    style.setAttribute("type", "text/css");
                                    style.setAttribute("rel", "stylesheet");
                                    style.setAttribute("href", this.server.url + "/" + skill + this.skillsPublicFiles[skill][i]);
                                    document.head.appendChild(style);
                                }
                                else if(SPLIT[SPLIT.length - 1].endsWith(".js")){
                                    let script = document.createElement("script");
                                    script.setAttribute("class", "dynamic_file");
                                    script.setAttribute("src", this.server.url + "/" + skill + this.skillsPublicFiles[skill][i]);
                                    document.head.appendChild(script);
                                }
                            }
                        }
                    }
                }

                this.firstUpdate = false;
              }
            },
            methods: {
                homeButtonClick: function(event) {
                    document.getElementById("dashboardButton").click();
                    event.stopPropagation();
                },
                startSTT: function() {
                    SELF.toggleRecording();
                },
                serverURLChange: function() {
                    SELF.Socket.emit("set_server_url", SELF.App.settings.ServerURL);
                },
                startSTTClick: function(){
                  MAIN.App.startSTT();
                },
                sendMessage: function (event, action) {
                  if(event !== undefined){
                    event.preventDefault();
                    action = event.target.getAttribute("action");
                  }
                  if(this.input.length > 0) {
                    SELF.Socket.emit(action, this.input);
                    if(event !== undefined){
                      event.target.reset();
                    }
                    this.input = "";
                  }
                },
                getMessageDate: function (_stringDate) {
                    const DATE = new Date(_stringDate);
                    let date = DATE.getDate();
                    let month = DATE.getMonth() + 1;
                    let year = DATE.getFullYear();
                    let minute = DATE.getMinutes();
                    let hour = DATE.getHours();
                    date = date < 10 ? "0" + date : date;
                    month = month < 10 ? "0" + month : month;
                    minute = minute < 10 ? "0" + minute : minute;
                    hour = hour < 10 ? "0" + hour : hour;
                    return date + "/" + month + "/" + year + " " + hour + ":" + minute;
                }
            }
        });

        // On vérifie que l'utilisateur a donné les droits d'accès au microphone.
        navigator.permissions.query({ name: "microphone" }).then(function(permissionStatus){
            switch(permissionStatus.state) { // granted, denied, prompt
                case "granted":
                    SELF.Socket.emit("wait_wake_word");
                    break;
                case "prompt":
                    SELF.Socket.emit("server", "microphone_prompt_permission");
                    navigator.mediaDevices.getUserMedia({ audio: true })
                        .then(function(stream) {
                            SELF.Socket.emit("server", "microphone_granted_permission");
                            SELF.Socket.emit("wait_wake_word");
                        })
                        .catch(function(err) {
                            SELF.Socket.emit("server", "microphone_denied_permission");
                        });
                break;
            }
        });

        this.AudioContext = new AudioContext();
        this.InputPoint = null;
        this.RealAudioInput = null;
        this.AudioInput = null;
        this.Recording = false;
















        var t = setInterval(function(){
          if(SELF.Volumes.length > 0){
            if(Date.now() - MAIN.RequestStartDate > 1000){
              var sum = 0;
              for( var i = 0; i < SELF.Volumes.length; i++ ){
                  sum += SELF.Volumes[i];
              }

              const AVERAGE = sum / SELF.Volumes.length;
              SELF.VolumeAverages.push(AVERAGE);

              const MAX = Math.max(...SELF.VolumeAverages);
              const PERCENT = AVERAGE * 100 / MAX;
              //console.log(PERCENT);
              if(PERCENT < SELF.AverageDifferenceToCut){
                SELF.toggleRecording();
              }

              SELF.Volumes = [];
            }
          }
        }, 1000);

        /* ###################################################################################################### */
        /* ### SOCKET ########################################################################################### */
        /* ###################################################################################################### */

        // Si la connection socket avec le serveur est réussie.
        this.Socket.on("connect", function() {
            if(SELF.App.AlreadyConnected === false){
                SELF.App.AlreadyConnected = true;
            }
            else{
                document.location.reload(true);
            }
        });

        // Ce message informe de l'état de connection avec le serveur.
        this.Socket.on("set_settings", function(_settings) {
            SELF.App.settings = _settings;
        });

        // Ce message informe de l'état de connection avec le serveur.
        this.Socket.on("server_state", function(_state, _url) {
            SELF.App.server.state = _state;
            SELF.App.server.url = _url;
        });

        this.Socket.on("cs_message", function(_message) {
            SELF.App.messages.push(_message);
            SELF.ScrollDown();
        });

        // Si le serveur envoie une mise à jour de l'état de completion du tuto
        this.Socket.on("set_done_tutorial", function(_data) {
            SELF.App.DoneTutorial = _data;
        });

        // Si le serveur envoie les traductions
        this.Socket.on("set_translation", function(_translation) {
            SELF.App.Dictionary = _translation;
        });

        this.Socket.on("sc_message", function(_message) {
            SELF.App.messages.push(_message);
            SELF.ScrollDown();
        });

        this.Socket.on("set_messages", function(_messages) {
            SELF.App.messages = _messages;
            SELF.ScrollDown();
        });

        this.Socket.on("play_audio", function(_audios) {
            SELF.PlayAudio(_audios[0].URL, _audios[0].PlaybackRate, _audios[0].Volume);
        });

        this.Socket.on("set_theme", function(_theme) {
            SELF.App.theme = _theme;
        });

        this.Socket.on("set_language", function(_language) {
            SELF.App.language = _language;
        });

        // Le serveur a détécté le mot clé, il est demandé au client d'activer le STT.
        this.Socket.on("start_stt", function() {
            SELF.Volume.Set(10);
            if(SELF.STT !== undefined){
                SELF.STT.Start();
            }
        });

        this.Socket.on("stop_stt", function() {
            console.log("stop_stt");
            if(SELF.Volume.Value < SELF.Volume.OldValue) {
                SELF.Volume.Set(SELF.Volume.OldValue);
            }
            if(SELF.STT !== undefined){
                SELF.STT.Stop();
            }
        });

        // On informe la GUI des fichiers des skills à charger.
        this.Socket.on("set_skills_public_files", function(_files) {
            SELF.App.skillsPublicFiles = _files;
        });

        // Le serveur central demande au client d'ouvrir une URL.
        this.Socket.on("open", function(_url, _newWindow) {
            if(_newWindow === true){
                window.open(_url, _newWindow);
            }
            else{
                window.location = _url;
            }
        });
    }

    /* ###################################################################################################### */
    /* ### FUNCTIONS ######################################################################################## */
    /* ###################################################################################################### */

    PlayAudio(_url, _playbackRate = 1, _volume = 100, _back = false, _imperturbable = false){
        const SELF = this;

        if(this.Volume.Value < this.Volume.OldValue) {
            this.Volume.Set(this.Volume.OldValue);
        }
        const SOUND = document.createElement("audio");
        SOUND.type = "audio/mpeg";
        SOUND.src = _url;
        if(_imperturbable === true) {
            SOUND.setAttribute("data-imperturbable", "");
        }
        SOUND.volume = (parseInt(_volume) * (this.Volume.Value / 100)) / 100;
        SOUND.setAttribute("data-volume", _volume);
        SOUND.playbackRate = _playbackRate;
        document.body.appendChild(SOUND);
        SOUND.onended = function(event) {
            SELF.StopAudio(event.target, _url, _back);
        };
        SOUND.play();
    }

    ScrollDown() {
        var elem = $("#message_body");
        elem.scrollTop(elem[0].scrollHeight);
    }

    StopAudio(_target, _url = "", _back = false) {
        _target.remove();
        if(_back === true) {
            this.Socket.emit("played_sound", _url);
        }
    }

    toggleRecording() {
        if (this.Recording === true) {
            // stop recording
            this.RequestStartDate = null;
            this.Recording = false;
            this.Socket.emit("end_recording");
        } else {
            // start recording
            this.InitAudio();
            this.RequestStartDate = Date.now();
            this.Recording = true;
            this.Socket.emit("start_recording", {numChannels: 1, bps: 16, fps: parseInt(this.AudioContext.sampleRate)});
        }
    }

    convertToMono( input ) {
        var splitter = this.AudioContext.createChannelSplitter(2);
        var merger = this.AudioContext.createChannelMerger(2);

        input.connect( splitter );
        splitter.connect( merger, 0, 0 );
        splitter.connect( merger, 0, 1 );
        return merger;
    }

    convertFloat32To1BitPCM(input){
      let buffer = new ArrayBuffer(input.length * 2);
      var output = new DataView(buffer);
      for (var i = 0, offset = 0; i < input.length; i++, offset += 2) {
        const S = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, S < 0 ? S * 0x8000 : S * 0x7FFF, true);
      }
      return buffer;
    }

    InitAudio() {
      if(this.App.firstAudioInit){
        this.App.firstAudioInit = false;
        const context = new AudioContext();
        navigator.mediaDevices.getUserMedia({
          audio: true
        }).then(function(microphone) {
          const source = context.createMediaStreamSource(microphone);
          context.audioWorklet.addModule("js/recorder.worklet.js").then(function() {
            const recorder = new AudioWorkletNode(
              context,
              "recorder.worklet"
            );

            source
              .connect(recorder)
              .connect(context.destination);

            recorder.port.onmessage = function(data) {
              if(MAIN.Recording){
                const CONVERTED = MAIN.convertFloat32To1BitPCM(data.data);
                MAIN.Socket.emit("write_audio", CONVERTED);

                var inputDataLength = data.data.length;
                var total = 0;
                for (var i = 0; i < inputDataLength; i++) {
                    total += Math.abs(data.data[i++]);
                }
                var rms = (Math.sqrt(total / inputDataLength)) * 100;
                MAIN.Volumes.push(rms);
              }
              // `data` is a Float32Array array containing our audio samples
            }
          });
        });
      }
    }
}
