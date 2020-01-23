const { Transform } = require('stream')

class Parser extends Transform {
  constructor() {
    super()

    this.length = 0
    this.register = 0
    this.buffer = Buffer.alloc(0)
  }

  _transform(chunk, encoding, cb) {
    console.log('Parser', chunk)
    let data = Buffer.concat([this.buffer, chunk])

    // is it long enough to find out the type?
    // is it complete for the type?

    // if (this.register) {
    //   //continuation
    // }
    // else {
    //   //start new
    // }


    // let position
    // while ((position = data.indexOf(this.delimiter)) !== -1) {
    //   this.push(data.slice(0, position + (this.includeDelimiter ? this.delimiter.length : 0)))
    //   data = data.slice(position + this.delimiter.length)
    // }
    this.buffer = data
    cb()
  }

  _flush(cb) {
    this.push(this.buffer)
    this.buffer = Buffer.alloc(0)
    cb()
  }
}

module.exports = Parser
