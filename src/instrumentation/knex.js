
const shimmer = require('shimmer')
// Modified from https://github.com/elastic/apm-agent-nodejs

// BSD 2-Clause License

// Copyright (c) 2012, Matt Robenolt
// Copyright (c) 2013-2014, Thomas Watson Steen and Elasticsearch BV
// Copyright (c) 2015-2020, Elasticsearch BV
// All rights reserved.

// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:

// * Redistributions of source code must retain the above copyright notice, this
//   list of conditions and the following disclaimer.

// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimer in the documentation
//   and/or other materials provided with the distribution.

const instrumentKnex = (knex, { logger, buffer, enabled }) => {
  if (!enabled) return knex

  logger.info('Shimming knex')

  if (knex.client) {
    logger.debug('shimming Knex.client.runner')
    shimmer.wrap(knex.client, 'runner', wrapRunner)
  } else {
    logger.debug('could not shim Knex')
  }

  function wrapRunner (original) {
    return function wrappedRunner () {
      var runner = original.apply(this, arguments)

      logger.debug('shimming knex runner.query')
      shimmer.wrap(runner, 'query', wrapQuery)

      return runner
    }
  }

  function wrapQuery (original) {
    return function wrappedQuery () {
      logger.debug('Intercepted call to the knex query function')
      const logStart = Date.now()
      return original.apply(this, arguments).then((response) => {
        buffer.push({
          start: logStart,
          end: Date.now(),
          label: JSON.stringify(arguments[0].sql)
        })

        return response
      })
    }
  }

  return knex
}

module.exports = {
  instrumentKnex
}
