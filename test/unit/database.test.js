'use strict'

const src = '../../src'
const P = require('bluebird')
const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')
const Proxyquire = require('proxyquire')

Test('database', databaseTest => {
  let sandbox
  let knexStub
  let tableStub
  let knexConnStub
  let Database
  let dbInstance

  let connectionString = 'mysql://some-data-uri/databaseSchema'
  let tableNames = [{ TABLE_NAME: 'accounts' }, { TABLE_NAME: 'users' }, { TABLE_NAME: 'tokens' }]

  databaseTest.beforeEach(t => {
    sandbox = Sinon.sandbox.create()

    knexConnStub = sandbox.stub()
    knexConnStub.destroy = sandbox.stub()
    knexConnStub.client = { config: { client: 'mysql' } }
    knexConnStub.withArgs('information_schema.tables').returns({ where: sandbox.stub().withArgs('TABLE_SCHEMA', 'databaseSchema').returns({ select: sandbox.stub().withArgs('TABLE_NAME').returns(P.resolve(tableNames)) }) })

    knexStub = sandbox.stub().returns(knexConnStub)

    tableStub = sandbox.stub()

    Database = Proxyquire(`${src}/database`, { knex: knexStub, './table': tableStub })
    dbInstance = new Database()

    t.end()
  })

  databaseTest.afterEach(t => {
    sandbox.restore()
    dbInstance.disconnect()
    t.end()
  })

  databaseTest.test('connect should', getKnexTest => {
    getKnexTest.test('return the knex database object', async (test) => {
      try {
        await dbInstance.connect(connectionString)
        const knex = await dbInstance.getKnex()
        test.ok(knex)
        test.end()
      } catch (e) {
        test.fail('Error thrown')
        test.end()
      }
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
    connectTest.test('connect using connection string and setup table properties', test => {
      dbInstance.connect(connectionString)
        .then(() => {
          test.ok(knexStub.calledOnce)
          test.equal(knexStub.firstCall.args[0].client, 'mysql')
          test.equal(knexStub.firstCall.args[0].connection, connectionString)

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
        dbInstance.connect('mysql://some-data-uri')
        test.fail('Should have thrown error')
        test.end()
      } catch (e) {
        test.notOk(knexStub.called)
        test.equal(e.message, 'Invalid database type in database URI')
        test.end()
      }
    })

    connectTest.test('throw error for invalid connection string', test => {
      dbInstance.connect('invalid')
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.notOk(knexStub.called)
          test.equal(err.message, 'Invalid database type in database URI')
          test.end()
        })
    })

    connectTest.test('throw error for unsupported database type in connection string', test => {
      dbInstance.connect('pg://some-data-uri/dbname')
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.notOk(knexStub.called)
          test.equal(err.message, 'Invalid database type in database URI')
          test.end()
        })
    })

    connectTest.test('throw error if database type not supported for listing tables', test => {
      delete dbInstance._listTableQueries['mysql']
      dbInstance.connect(connectionString)
        .then(() => {
          test.fail('Should have thrown error')
          test.end()
        })
        .catch(err => {
          test.equal(err.message, 'Listing tables is not supported for database type mysql')
          test.end()
        })
    })

    connectTest.test('only create connection once on multiple connect calls', test => {
      dbInstance.connect(connectionString)
        .then(() => {
          dbInstance.connect(connectionString)
            .then(() => {
              test.ok(knexStub.calledOnce)
              test.end()
            })
        })
    })

    connectTest.end()
  })

  databaseTest.test('known table property should', tablePropTest => {
    tablePropTest.test('create new query object for known table', test => {
      let tableName = tableNames[0].TABLE_NAME

      let obj = {}
      tableStub.returns(obj)

      dbInstance.connect(connectionString)
        .then(() => {
          let table = dbInstance[tableName]
          test.equal(table, obj)
          test.ok(tableStub.calledWith(tableName, knexConnStub))
          test.end()
        })
    })

    tablePropTest.end()
  })

  databaseTest.test('disconnect should', disconnectTest => {
    disconnectTest.test('call destroy and reset connection', test => {
      dbInstance.connect(connectionString)
        .then(() => {
          test.ok(dbInstance._knex)

          dbInstance.disconnect()
          test.ok(knexConnStub.destroy.calledOnce)
          test.notOk(dbInstance._knex)

          test.end()
        })
    })

    disconnectTest.test('remove table properties and reset table list to empty', test => {
      dbInstance.connect(connectionString)
        .then(() => {
          test.ok(dbInstance[tableNames[0].TABLE_NAME])
          test.equal(dbInstance._tables.length, tableNames.length)

          dbInstance.disconnect()
          test.notOk(dbInstance[tableNames[0].TABLE_NAME])
          test.equal(dbInstance._tables.length, 0)

          test.end()
        })
    })

    disconnectTest.test('do nothing if not connected', test => {
      dbInstance.connect(connectionString)
        .then(() => {
          test.ok(dbInstance._knex)

          dbInstance.disconnect()
          test.equal(knexConnStub.destroy.callCount, 1)
          test.notOk(dbInstance._knex)

          dbInstance.disconnect()
          test.equal(knexConnStub.destroy.callCount, 1)
          test.notOk(dbInstance._knex)

          test.end()
        })
    })

    disconnectTest.end()
  })

  databaseTest.test('from should', fromTest => {
    fromTest.test('create a new knex object for specified table', test => {
      let tableName = 'table'

      let obj = {}
      tableStub.returns(obj)

      dbInstance.connect(connectionString)
        .then(() => {
          let fromTable = dbInstance.from(tableName)
          test.equal(fromTable, obj)
          test.ok(tableStub.calledWith(tableName, knexConnStub))
          test.end()
        })
    })

    fromTest.test('throw error if database not connected', test => {
      let tableName = 'table'

      let obj = {}
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

  databaseTest.end()
})
