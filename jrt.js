const dbg = require('debug')
const debug = dbg('jrt');
const hex = (v) => v.toString(16).padStart(2, '0')
dbg.formatters.h = (v) => v.length ? Array.prototype.map.call(v, b => hex(b)).join(' ') : hex(v)

const EventEmitter = require('events').EventEmitter;
const DefaultBindings = require('@serialport/bindings')
const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t));

const CMD = {
  AUTO_BAUDRATE:   () => Buffer.from([0x55]),
  READ_STATUS:     (addr) => Buffer.from([0xAA, 0x80 | addr, 0x00, 0x00, 0x80 + addr]),
  READ_HW:         (addr) => Buffer.from([0xAA, 0x80 | addr, 0x00, 0x0A, 0x8A + addr]),
  READ_SW:         (addr) => Buffer.from([0xAA, 0x80 | addr, 0x00, 0x0C, 0x8C + addr]),
  READ_SN:         (addr) => Buffer.from([0xAA, 0x80 | addr, 0x00, 0x0E, 0x8E + addr]),
  READ_VOLTAGE:    (addr) => Buffer.from([0xAA, 0x80 | addr, 0x00, 0x06, 0x86 + addr]),
  READ_MEASUREMENT:(addr) => Buffer.from([0xAA, 0x80 | addr, 0x00, 0x22, 0xA2 + addr]),
  LASER_ON:        (addr) => Buffer.from([0xAA, addr,        0x01, 0xBE, 0x00, 0x01, 0x00, 0x01, 0xC1 + addr]),
  LASER_OFF:       (addr) => Buffer.from([0xAA, addr,        0x01, 0xBE, 0x00, 0x01, 0x00, 0x00, 0xC0 + addr]),
  ONESHOT_AUTO:    (addr) => Buffer.from([0xAA, addr,        0x00, 0x20, 0x00, 0x01, 0x00, 0x00, 0x21 + addr]),
  ONESHOT_SLOW:    (addr) => Buffer.from([0xAA, addr,        0x00, 0x20, 0x00, 0x01, 0x00, 0x01, 0x22 + addr]),
  ONESHOT_FAST:    (addr) => Buffer.from([0xAA, addr,        0x00, 0x20, 0x00, 0x01, 0x00, 0x02, 0x23 + addr]),
  CONTINUOUS_EXIT: () => Buffer.from([0x58]),
  CONTINUOUS_AUTO: (addr) => Buffer.from([0xAA, addr,        0x00, 0x20, 0x00, 0x01, 0x00, 0x04, 0x25 + addr]),
  CONTINUOUS_SLOW: (addr) => Buffer.from([0xAA, addr,        0x00, 0x20, 0x00, 0x01, 0x00, 0x05, 0x26 + addr]),
  CONTINUOUS_FAST: (addr) => Buffer.from([0xAA, addr,        0x00, 0x20, 0x00, 0x01, 0x00, 0x06, 0x27 + addr]),
  SET_ADDRESS:     (addr, desired) => Buffer.from([0xAA, addr, 0x00, 0x10, 0x00, 0x01, 0x00, desired, 0x11 + addr + desired]),
  SET_OFFSET:      (addr, offset) => {
    const buff = Buffer.from([0xAA, addr, 0x00, 0x12, 0x00, 0x01, 0x00, 0x00, 0x00])
    buff.writeInt16BE(offset, 6)
    buff[8] = 0x13 + addr + buff[6] + buff[7]
    return buff
  },
}

const ERRORS = {
  0x0000: 'No error',
  0x0001: 'Power input too low, power voltage should >= 2.2V',
  0x0002: 'Internal error, don\'t care',
  0x0003: 'Module temperature is too low(< -20℃)',
  0x0004: 'Module temperature is too high(> +40℃)',
  0x0005: 'Target out of range',
  0x0006: 'Invalid measure result',
  0x0007: 'Background light too strong',
  0x0008: 'Laser signal too weak',
  0x0009: 'Laser signal too strong',
  0x000A: 'Hardware fault 1',
  0x000B: 'Hardware fault 2',
  0x000C: 'Hardware fault 3',
  0x000D: 'Hardware fault 4',
  0x000E: 'Hardware fault 5',
  0x000F: 'Laser signal not stable',
  0x0010: 'Hardware fault 6',
  0x0011: 'Hardware fault 7',
  0x0081: 'Invalid Frame',
}

module.exports.open = async (id, baudRate = 19200, timeout = 5000) => {
  debug('opening', id, baudRate)
  const port = new DefaultBindings({})
  await port.open(id, { baudRate, autoOpen:true })
  await port.write(Buffer.from([0x58]))
  await sleep(50)
  await port.set({ dtr: false })
  await port.flush()
  await sleep(200)
  await port.write(CMD.AUTO_BAUDRATE())

  let result
  let timedout = false
  debug('waiting for address')
  setTimeout(() => {
    if (result) return
    timedout = true
    port.close()
  }, timeout)

  result = await port.read(Buffer.alloc(1), 0, 1).catch((err) => {
    err = timedout? new Error('TIMEOUT') : err
    debug(err)
    throw err
  })

  return handler(port, result.buffer[0])
}

const handler = (port, addr) => {
  debug('Device Found: 0x%h', addr)

  const write = async (d) => {
    debug('write [%h]', d)
    await port.write(d)
    await port.drain()
  }

  const reader = async () => {
    let buffer = Buffer.alloc(13)
    let bytesRead = 0
    let size
    let isMeasurement = false
    let isError = false

    do {
      const result = await port.read(buffer, bytesRead, 13-bytesRead)
      bytesRead += result.bytesRead

      if (!size) {
        isError = buffer[0] === 0xEE
        if (isError) {
          size = 9
        }
        else if (buffer[0] === 0xAA && bytesRead > 3) {
          const register = buffer.readUInt16BE(2)
          // measurement results are 13 long everything else is 9
          isMeasurement = register === 0x20 || register === 0x22
          size = isMeasurement ? 13 : 9
        }
      }
    }
    while(!size || bytesRead < size)

    buffer = buffer.slice(0, size)
    debug('read [%h]', buffer)
    // continuously read
    setImmediate(reader)

    // emit data
    emitter.emit('data', buffer)
    const message = {
      address: buffer[1] & 0b111111,
      register: buffer.readUInt16BE(2),
      // count: buffer.readUInt16BE(4), // pointless number
      value: buffer.readUInt16BE(6)
    }
    if(isError) {
      message.error = new Error(ERRORS[message.value])
      emitter.emit('error', message)
    }
    else if (isMeasurement) {
      message.value = buffer.readUInt32BE(6)
      message.quality = buffer.readUInt16BE(10)
      emitter.emit('measurement', message)
    }
    else if (message.register === 0x06) { // voltage is BCD
      message.value = Number((message.value).toString(16))/1000
    }
    else if (message.register === 0x12) { // offset allows negative numbers
      message.value = buffer.readInt16BE(6)
    }
    emitter.emit('message', message)
  }
  // start reading
  setImmediate(reader)

  const response = async () => new Promise((resolve) => {
    emitter.once('message', resolve)
  })
  const read = async (cmd) => {
    await write(CMD[cmd](addr))
    return response()
  }

  const emitter = new EventEmitter()
  emitter.on('error', () => {}) // needed to silence uncaught Promise rejections

  Object.assign(emitter,{
    read_status:     async () => {
      const result = await read('READ_STATUS')
      result.error = ERRORS[result.value]
      return result
    },
    read_hw:         () => read('READ_HW'),
    read_sw:         () => read('READ_SW'),
    read_sn:         () => read('READ_SN'),
    read_voltage:    () => read('READ_VOLTAGE'),
    read_measurement:() => read('READ_MEASUREMENT'),
    laser_on:        () => read('LASER_ON'),
    laser_off:       () => read('LASER_OFF'),
    oneshot_auto:    () => read('ONESHOT_AUTO'),
    oneshot_slow:    () => read('ONESHOT_SLOW'),
    oneshot_fast:    () => read('ONESHOT_FAST'),
    continuous_exit: () => write(CMD.CONTINUOUS_EXIT()),
    continuous_auto: () => write(CMD.CONTINUOUS_AUTO(addr)),
    continuous_slow: () => write(CMD.CONTINUOUS_SLOW(addr)),
    continuous_fast: () => write(CMD.CONTINUOUS_FAST(addr)),
    set_address: async (desired) => {
      await write(CMD.SET_ADDRESS(addr, desired))
      const res = await response()
      if (!res.error) addr = desired
      return res
    },
    set_offset: async (offset) => {
      await write(CMD.SET_OFFSET(addr, offset))
      return response()
    }
  })

  return emitter
}
