'use strict'

const _ = require('lodash')
const Metrics = require('@mojaloop/central-services-metrics')

class Table {
  constructor (name, knex) {
    this._tableName = name
    this._knex = knex
    this._conditionRegex = /(\w+)\s*(<>|>=|<=|>|<|=)?/
  }

  insert (fields) {
    const histTimerEnd = Metrics.getHistogram(
      'cl_database_insert',
      'Database Insert',
      ['success']
    ).startTimer()
    return this._createBuilder().insert(fields, '*').then(inserted => {
      if (inserted.length === 0) {
        histTimerEnd({ success: false })
        throw new Error(`There was an error inserting the record to ${this._tableName}`)
      }
      histTimerEnd({ success: true })
      return inserted[0]
    })
  }

  update (criteria, fields) {
    const histTimerEnd = Metrics.getHistogram(
      'cl_database_update',
      'Database Update',
      ['success']
    ).startTimer()
    const builder = this._createBuilder()
    return this._addWhere(criteria, builder).update(fields, '*').then(updated => {
      if (updated.length === 0) {
        histTimerEnd({ success: true })
        return null
      }
      histTimerEnd({ success: true })
      return updated.length === 1 ? updated[0] : updated
    })
  }

  find (criteria, options) {
    const histTimerEnd = Metrics.getHistogram(
      'cl_database_find',
      'Database Find',
      ['success']
    ).startTimer()
    let builder = this._createBuilder()
    builder = this._addWhere(criteria, builder)
    builder = this._addOptions(options, builder)
    histTimerEnd({ success: true })
    return builder.then(results => results)
  }

  findOne (criteria, options) {
    const histTimerEnd = Metrics.getHistogram(
      'cl_database_findOne',
      'Database FindOne',
      ['success']
    ).startTimer()
    return this.find(criteria, options).then(results => {
      histTimerEnd({ success: true })
      return results.length > 0 ? results[0] : null
    })
  }

  destroy (criteria) {
    const histTimerEnd = Metrics.getHistogram(
      'cl_database_destroy',
      'Database Destroy',
      ['success']
    ).startTimer()
    const builder = this._createBuilder()
    return this._addWhere(criteria, builder).del('*').then(deleted => {
      if (deleted.length === 0) {
        histTimerEnd({ success: true })
        return null
      }
      histTimerEnd({ success: true })
      return deleted.length === 1 ? deleted[0] : deleted
    })
  }

  truncate () {
    return this._createBuilder().truncate().then(results => results)
  }

  count (criteria, column) {
    const builder = this._createBuilder()
    return this._addWhere(criteria, builder).count(column).then(record => parseInt(record[0].count))
  }

  max (criteria, column) {
    const builder = this._createBuilder()
    return this._addWhere(criteria, builder).max(column).then(record => record[0].max)
  }

  query (cb) {
    return cb(this._createBuilder()).then(results => results)
  }

  _createBuilder () {
    return this._knex(this._tableName)
  }

  _parseCriteriaKey (key) {
    const parsed = this._conditionRegex.exec(key) || [undefined, key, undefined]
    return [parsed[1], parsed[2]].filter(x => x !== undefined)
  }

  _addWhere (params, builder) {
    const criteria = params || {}
    if (_.keys(criteria).length > 0) {
      _.forEach(criteria, (value, key) => {
        const condition = this._parseCriteriaKey(key)
        if (condition.length === 1) {
          if (_.isArray(value)) {
            builder = builder.whereIn(condition[0], value)
          } else {
            builder = builder.where(condition[0], value)
          }
        } else {
          builder = builder.where(condition[0], condition[1], value)
        }
      })
    }
    return builder
  }

  _addOptions (params, builder) {
    const options = params || {}
    if (options.order) {
      const orderBy = options.order.match(/\S+/g) || []
      if (orderBy.length === 1) {
        builder = builder.orderBy(orderBy[0], 'asc')
      } else if (orderBy.length === 2) {
        builder = builder.orderBy(orderBy[0], orderBy[1])
      }
    }
    return builder
  }
}

module.exports = Table
