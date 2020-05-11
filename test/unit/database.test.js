'use strict'

const src = '../../src'
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const Proxyquire = require('proxyquire')
const lodash = require('lodash')
const ActualDatabase = require('../../src/database')

Test('database', databaseTest => {
  let sandbox
  let knexStub
  let tableStub
  let knexConnStub
  let Database
  let dbInstance

  const connectionConfig = {
    client: 'mysql',
    connection: {
      host: 'some-data-uri',
      port: '9999',
      user: 'user',
      password: 'password',
      database: 'databaseSchema'
    },
    pool: {
      // minimum size
      min: 2,
      // maximum size
      max: 10,
      // acquire promises are rejected after this many milliseconds
      // if a resource cannot be acquired
      acquireTimeoutMillis: 30000,
      // create operations are cancelled after this many milliseconds
      // if a resource cannot be acquired
      createTimeoutMillis: 3000,
      // destroy operations are awaited for at most this many milliseconds
      // new resources will be created after this timeout
      destroyTimeoutMillis: 5000,
      // free resouces are destroyed after this many milliseconds
      idleTimeoutMillis: 30000,
      // how often to check for idle resources to destroy
      reapIntervalMillis: 1000,
      // long long to idle after failed create before trying again
      createRetryIntervalMillis: 200
      // ping: function (conn, cb) { conn.query('SELECT 1', cb) }
    },
    debug: false
  }
  const tableNames = [{ TABLE_NAME: 'accounts' }, { TABLE_NAME: 'users' }, { TABLE_NAME: 'tokens' }]

  databaseTest.beforeEach(t => {
    sandbox = Sinon.createSandbox()

    knexConnStub = sandbox.stub()
    knexConnStub.destroy = sandbox.stub()
    knexConnStub.client = { config: { client: 'mysql' } }
    knexConnStub.withArgs('information_schema.tables').returns({ where: sandbox.stub().withArgs('TABLE_SCHEMA', 'databaseSchema').returns({ select: sandbox.stub().withArgs('TABLE_NAME').returns(Promise.resolve(tableNames)) }) })
    knexConnStub.withArgs('pg_catalog.pg_tables').returns({ where: sandbox.stub().withArgs({ schemaname: 'public' }).returns({ select: sandbox.stub().withArgs('tablename').returns(Promise.resolve(tableNames)) }) })

    knexStub = sandbox.stub().returns(knexConnStub)

    tableStub = sandbox.stub()

    Database = Proxyquire(`${src}/database`, { knex: knexStub, './table': tableStub })
    dbInstance = new Database()

    t.end()
  })

  databaseTest.afterEach(async t => {
    sandbox.restore()
    await dbInstance.disconnect()
    t.end()
  })

  databaseTest.test('connect should', getKnexTest => {
    getKnexTest.test('return the knex database object', async (test) => {
      try {
        await dbInstance.connect(connectionConfig)
        const knex = await dbInstance.getKnex()
        test.ok(knex)
        test.end()
      } catch (e) {
        test.fail('Error thrown')
        test.end()
      }
    })

    getKnexTest.test('handle connection with a deprecated URI', async test => {
      // Arrange
      const URI = 'mysql://central_ledger:password@mysql-cl:3307/central_ledger_db'

      // Act
      try {
        await dbInstance.connect(URI)
        const knex = await dbInstance.getKnex()

        // Assert
        test.ok(knex)
      } catch (e) {
        test.fail('Error thrown')
      }

      test.end()
    })

    getKnexTest.test('should fail if the config.connection object is undefined', async test => {
      // Arrange
      const config = {}

      // Act
      try {
        await dbInstance.connect(config)

        test.fail('Should have thrown error')
      } catch (e) {
        // Assert
        test.equal(e.message, 'Invalid database schema in database config')
      }

      test.end()
    })

    getKnexTest.test('throw error when database is not connected', test => {
      try {
        dbInstance.getKnex()
        test.fail('No Error thrown')
        test.end()
      } catch (e) {
        test.pass('Error thrown')
        test.end()
      }
    })
    getKnexTest.end()
  })

  databaseTest.test('connect should', connectTest => {
    connectTest.test('connect using connection string and setup table properties', async test => {
      await dbInstance.connect(connectionConfig)
        .then(() => {
          test.ok(knexStub.calledOnce)
          test.equal(knexStub.firstCall.args[0].client, 'mysql')

          test.equal(dbInstance._tables.length, tableNames.length)
          tableNames.forEach(tbl => {
            test.ok(dbInstance[tbl.TABLE_NAME])
          })
          test.notOk(dbInstance.tableNotExists)

          test.end()
        })
    })

    connectTest.test('throw error for invalid database schema', async (test) => {
      try {
        const connectionConfigDuplicate = lodash.cloneDeep(connectionConfig)
        connectionConfigDuplicate.connection.database = undefined
        await dbInstance.connect(connectionConfigDuplicate)
        test.fail('Should have thrown error')
        test.end()
      } catch (e) {
        test.notOk(knexStub.called)
        test.equal(e.message, 'Invalid database schema in database config')
        test.end()
      }
    })

    connectTest.test('connect using connection config pg and setup table properties', async test => {
      const connectionConfigDuplicate = lodash.cloneDeep(connectionConfig)
      connectionConfigDuplicate.client = 'pg'
      knexConnStub.client = { config: { client: 'pg' } }
      await dbInstance.connect(connectionConfigDuplicate)
        .then(() => {
          test.ok(knexStub.calledOnce)
          test.equal(knexStub.firstCall.args[0].client, 'pg')

          test.equal(dbInstance._tables.length, tableNames.length)
          tableNames.forEach(tbl => {
            test.ok(dbInstance[tbl.tablename])
          })
          test.notOk(dbInstance.tableNotExists)

          test.end()
        })
    })

    connectTest.test('throw error if database type not supported for listing tables', async test => {
      delete dbInstance._listTableQueries.mysql
      await dbInstance.connect(connectionConfig)
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.equal(err.message, 'Listing tables is not supported for database type mysql')
          test.end()
        })
    })

    connectTest.test('only create connection once on multiple connect calls', async test => {
      await dbInstance.connect(connectionConfig)
        .then(async () => {
          await dbInstance.connect(connectionConfig)
            .then(() => {
              test.ok(knexStub.calledOnce)
              test.end()
            })
        })
    })

    connectTest.end()
  })

  databaseTest.test('known table property should', tablePropTest => {
    tablePropTest.test('create new query object for known table', async test => {
      const tableName = tableNames[0].TABLE_NAME

      const obj = {}
      tableStub.returns(obj)

      await dbInstance.connect(connectionConfig)
        .then(() => {
          const table = dbInstance[tableName]
          test.equal(table, obj)
          test.ok(tableStub.calledWith(tableName, knexConnStub))
          test.end()
        })
    })

    tablePropTest.end()
  })

  databaseTest.test('disconnect should', disconnectTest => {
    disconnectTest.test('call destroy and reset connection', async test => {
      await dbInstance.connect(connectionConfig)
        .then(async () => {
          test.ok(dbInstance._knex)

          await dbInstance.disconnect()
          test.ok(knexConnStub.destroy.calledOnce)
          test.notOk(dbInstance._knex)

          test.end()
        })
    })

    disconnectTest.test('remove table properties and reset table list to empty', async test => {
      await dbInstance.connect(connectionConfig)
        .then(async () => {
          test.ok(dbInstance[tableNames[0].TABLE_NAME])
          test.equal(dbInstance._tables.length, tableNames.length)

          await dbInstance.disconnect()
          test.notOk(dbInstance[tableNames[0].TABLE_NAME])
          test.equal(dbInstance._tables.length, 0)

          test.end()
        })
    })

    disconnectTest.test('do nothing if not connected', async test => {
      await dbInstance.connect(connectionConfig)
        .then(async () => {
          test.ok(dbInstance._knex)

          await dbInstance.disconnect()
          test.equal(knexConnStub.destroy.callCount, 1)
          test.notOk(dbInstance._knex)

          await dbInstance.disconnect()
          test.equal(knexConnStub.destroy.callCount, 1)
          test.notOk(dbInstance._knex)

          test.end()
        })
    })

    disconnectTest.end()
  })

  databaseTest.test('from should', fromTest => {
    fromTest.test('create a new knex object for specified table', async test => {
      const tableName = 'table'

      const obj = {}
      tableStub.returns(obj)

      await dbInstance.connect(connectionConfig)
        .then(() => {
          const fromTable = dbInstance.from(tableName)
          test.equal(fromTable, obj)
          test.ok(tableStub.calledWith(tableName, knexConnStub))
          test.end()
        })
    })

    fromTest.test('throw error if database not connected', test => {
      const tableName = 'table'

      const obj = {}
      tableStub.returns(obj)

      try {
        dbInstance.from(tableName)
        test.fail('Should have thrown error')
      } catch (err) {
        test.equal(err.message, 'The database must be connected to get a table object')
        test.end()
      }
    })

    fromTest.end()
  })

  databaseTest.test('instrument should', instrumentTest => {
    instrumentTest.test('wrap query and log sql calls into the internal buffer', async test => {
      const instrumentConfig = {
        client: 'sqlite3',
        connection: {
          filename: ':memory:',
          supportBigNumbers: true
        },
        useNullAsDefault: true,
        debug: false,
        instrument: true
      }

      const instrumentedDbInstance = new ActualDatabase()
      const originalNow = Date.now
      Date.now = () => 1589207691139

      await instrumentedDbInstance.connect(instrumentConfig).then(async () => {
        const buffer = instrumentedDbInstance.getInstrumentationBuffer()
        test.equal(buffer.length, 1)
        test.equal(buffer[0].start, 1589207691139)
        test.equal(buffer[0].end, 1589207691139)
        test.equal(buffer[0].label, '"select * from `sqlite_master` where `type` = ?"')
        Date.now = originalNow
        instrumentedDbInstance.disconnect()
        test.end()
      })     
    })

    instrumentTest.end()
  })

  databaseTest.end()
})
