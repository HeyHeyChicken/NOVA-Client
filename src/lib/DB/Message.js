const LIBRARIES = {
  FS: require("fs")
};

class Message {
  constructor(_content, _fromServer, _date = new Date()) {
    this.ID = typeof _date === "string" ? new Date(_date).getTime() : _date.getTime();
    this.Content = _content;
    this.FromServer = _fromServer;
    this.Date = _date;
  }

  Insert(_main){
    Message._PrepareFile(_main);

    const DATA = JSON.parse(LIBRARIES.FS.readFileSync(Message._GetPath(_main), "utf8"));
    DATA.push(this);
    LIBRARIES.FS.writeFileSync(Message._GetPath(_main), JSON.stringify(DATA, null, 4), "utf8");

    return this;
  }

  /* ######################################################################################## */
  /* ### STATIC ############################################################################# */
  /* ######################################################################################## */

  static SelectAll(_main){
    Message._PrepareFile(_main);

    return JSON.parse(LIBRARIES.FS.readFileSync(Client._GetPath(_main), "utf8"));
  }

  /* ######################################################################################## */
  /* ### PRIVATE ############################################################################ */
  /* ######################################################################################## */

  static _GetPath(_main){
    return _main.DirName + "/lib/DB/Message.json";
  }

  static _PrepareFile(_main){
    const PATH = Message._GetPath(_main);
    if (!LIBRARIES.FS.existsSync(PATH)) {
      LIBRARIES.FS.writeFileSync(PATH, JSON.stringify([]));
    }
  }
}

module.exports = Message;
