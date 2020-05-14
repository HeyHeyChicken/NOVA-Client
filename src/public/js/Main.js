class Main {
    constructor() {
        const SELF = this;

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
                PresentationMode: false,
                skillsPublicFiles: {},
                server: {
                    state: false,
                    url: null
                },
                messages: [],
                input: "",
                language: null,
                AlreadyConnected: false
            },
            updated() {
                SELF.ScrollDown();

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
            },
            methods: {
                startSTT: function() {
                    SELF.toggleRecording();
                },
                sendMessage: function (event) {
                    event.preventDefault();
                    const MESSAGE = $(event.target).serializeArray().find(x => x.name === "message").value;
                    if(MESSAGE.length > 0) {
                        SELF.Socket.emit(event.target.getAttribute("action"), MESSAGE);
                        event.target.reset();
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
        this.InitAudio();

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
        this.Socket.on("server_state", function(_state, _url) {
            SELF.App.server.state = _state;
            SELF.App.server.url = _url;
        });

        this.Socket.on("cs_message", function(_message) {
            SELF.App.messages.push(_message);
            SELF.ScrollDown();
        });

        this.Socket.on("sc_message", function(_message) {
            SELF.App.messages.push(_message);
            SELF.ScrollDown();
        });

        this.Socket.on("set_messages", function(_messages) {
            SELF.App.messages = _messages;
            SELF.ScrollDown(); // Ca fonctionne pas ... Salim ?
        });

        this.Socket.on("play_audio", function(_audios) {
            SELF.PlayAudio(_audios[0].URL, _audios[0].PlaybackRate, _audios[0].Volume);
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
        this.Socket.on("open", function(_url) {
            window.open(_url);
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
            //this.Recording = false;
            this.Socket.emit("end_recording");
        } else {
            // start recording
            //this.Recording = true;
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

    cancelAnalyserUpdates() {
        window.cancelAnimationFrame( rafID );
        rafID = null;
    }

    updateAnalysers(time) {
        if (!analyserContext) {
            var canvas = document.getElementById("analyser");
            canvasWidth = canvas.width;
            canvasHeight = canvas.height;
            analyserContext = canvas.getContext("2d");
        }

        // analyzer draw code here
        {
            var SPACING = 3;
            var BAR_WIDTH = 1;
            var numBars = Math.round(canvasWidth / SPACING);
            var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

            analyserNode.getByteFrequencyData(freqByteData);

            analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
            analyserContext.fillStyle = '#F6D565';
            analyserContext.lineCap = 'round';
            var multiplier = analyserNode.frequencyBinCount / numBars;

            // Draw rectangle for each frequency bin.
            for (var i = 0; i < numBars; ++i) {
                var magnitude = 0;
                var offset = Math.floor( i * multiplier );
                // gotta sum/average the block, or we miss narrow-bandwidth spikes
                for (var j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
                magnitude = magnitude / multiplier;
                var magnitude2 = freqByteData[i * multiplier];
                analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
                analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
            }
        }

        rafID = window.requestAnimationFrame( updateAnalysers );
    }

    toggleMono() {
        if (this.AudioInput != this.RealAudioInput) {
            this.AudioInput.disconnect();
            this.RealAudioInput.disconnect();
            this.AudioInput = this.RealAudioInput;
        } else {
            this.RealAudioInput.disconnect();
            this.AudioInput = this.convertToMono( this.RealAudioInput );
        }

        this.AudioInput.connect(this.InputPoint);
    }

    gotStream(stream) {
        MAIN.InputPoint = MAIN.AudioContext.createGain();

        // Create an AudioNode from the stream.
        MAIN.RealAudioInput = MAIN.AudioContext.createMediaStreamSource(stream);
        MAIN.AudioInput = MAIN.RealAudioInput;

        MAIN.AudioInput = MAIN.convertToMono( MAIN.AudioInput );
        MAIN.AudioInput.connect(MAIN.InputPoint);

        var analyserNode = MAIN.AudioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        MAIN.InputPoint.connect( analyserNode );

        var scriptNode = (MAIN.AudioContext.createScriptProcessor || MAIN.AudioContext.createJavaScriptNode).call(MAIN.AudioContext, 1024, 1, 1);
        scriptNode.onaudioprocess = function (audioEvent) {
            if (MAIN.Recording) {
                const input = audioEvent.inputBuffer.getChannelData(0);

                // convert float audio data to 16-bit PCM
                var buffer = new ArrayBuffer(input.length * 2)
                var output = new DataView(buffer);
                for (var i = 0, offset = 0; i < input.length; i++, offset += 2) {
                var s = Math.max(-1, Math.min(1, input[i]));
                    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                }
                MAIN.Socket.emit("write_audio", buffer);
            }
        }
        MAIN.InputPoint.connect(scriptNode);
        scriptNode.connect(MAIN.AudioContext.destination);

        const zeroGain = MAIN.AudioContext.createGain();
        zeroGain.gain.value = 0.0;
        MAIN.InputPoint.connect( zeroGain );
        zeroGain.connect( MAIN.AudioContext.destination );
        //updateAnalysers();
    }

    InitAudio() {
        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

        navigator.getUserMedia({audio: true}, this.gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
    }
}
