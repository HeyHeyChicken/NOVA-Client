class Message {
  constructor(_content, _fromServer, _date = new Date()) {
    this.ID = typeof _date === "string" ? new Date(_date).getTime() : _date.getTime();
    this.Content = _content;
    this.FromServer = _fromServer;
    this.Date = _date;
  }

  Insert(_db){
    var stmt = _db.prepare("INSERT INTO Messages VALUES (?, ?, ?, ?)");
    stmt.run(this.ID, this.Content, this.Date, this.FromServer);
    stmt.finalize();
    return this;
  }
}

module.exports = Message;
