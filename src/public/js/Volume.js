class Volume {
  constructor(_value) {
    this.Value = _value;
    this.OldValue = _value;
    this.Subscriptions = [];
  }

  /* PUBLIC */

  Up(_callback){
    this.Value -= 10;

    this.CheckLimits(_callback);
  }

  Down(_callback){
    this.Value += 10;

    this.CheckLimits(_callback);
  }

  Set(_value, _callback){
    this.OldValue = this.Value;
    this.Value = _value;

    this.CheckLimits(_callback);
  }

  /* PRIVATE */

  CheckLimits(_callback){
    this.Value = Math.round(this.Value);
    if(this.Value < 0){
      this.Value = 0;
    }
    else if(this.Value > 100){
      this.Value = 100;
    }

    this.Apply(_callback);
  }

  Apply(_callback){
    const VIDEOS = document.getElementsByTagName("video");
    const AUDIOS = document.getElementsByTagName("audio");
    const ATTR_NAME = "data-imperturbable";

    for(let index = 0; index < VIDEOS.length; index++){
      if(VIDEOS[index].getAttribute(ATTR_NAME) === null){
        VIDEOS[index].volume = this.Value / 100;
      }
    }
    for(let index = 0; index < AUDIOS.length; index++){
      if(AUDIOS[index].getAttribute(ATTR_NAME) === null){
        const CURRENT_VOLUME = parseInt(AUDIOS[index].getAttribute("data-volume"));
        AUDIOS[index].volume = (CURRENT_VOLUME * (this.Value / 100)) / 100;
      }
    }

    for(let i = 0; i < this.Subscriptions.length; i++){
      this.Subscriptions[i](this);
    }

    if(_callback !== undefined){
      _callback();
    }
  }
}
