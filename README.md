# jrt
A Node.js module for a JRT laser distance sensor

```js
const JRT = require('jrt')
const id = '/dev/tty.usbserial-0000'

JRT.open(id).then(async (jrt) => {
  jrt.on('message', (data) => {
    console.log('message', data)
  })

  console.log(await jrt.oneshot_auto())

  console.log({
    read_status: await jrt.read_status().then(r => r.value),
    read_measurement: await jrt.read_measurement().then(r => r.value),
    read_hw: await jrt.read_hw().then(r => r.value),
    read_sw: await jrt.read_sw().then(r => r.value),
    read_sn: await jrt.read_sn().then(r => r.value),
    read_voltage: await jrt.read_voltage().then(r => r.value),
    laser_on: await jrt.laser_on().then(r => r.value),
    laser_off: await jrt.laser_off().then(r => r.value),
  })

  await jrt.continuous_auto()
  setTimeout(jrt.continuous_exit, 30000)
})
```

## API
### read_status()
### read_hw ()
### read_sw ()
### read_sn ()
### read_voltage ()
### read_measurement ()
### laser_on ()
### laser_off ()
### oneshot_auto ()
### oneshot_slow ()
### oneshot_fast ()
### continuous_exit ()
### continuous_auto ()
### continuous_slow ()
### continuous_fast ()
### set_address(desired)
### set_offset(offset)

## Events
### data
Emits the raw data received.

### error
Emitted when an error (`EE`) message is received.

### measurement
Emitted when a measurement message is received.

### message
Emits all parsed messages.
