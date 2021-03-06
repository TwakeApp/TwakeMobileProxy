import Fastify, {FastifyInstance} from 'fastify'
import {BadRequest, Forbidden, PayloadTooLarge} from './common/errors';
import {AssertionError} from "assert";
import config from './common/config'
import {FILE_SIZE} from './services/uploader/types'
import channelsServiceRoutes from './services/channels/routes'
import workspacesServiceRoutes from './services/workspaces/routes'
import usersServiceRoutes from './services/users/routes'
import messagesServiceRoutes from './services/messages/routes'
import authorizationServiceRoutes from './services/authorization/routes'
import infoServiceRoutes from './services/info/routes'
import companiesServiceRoutes from './services/companies/routes'
import uploadServiceRoutes from './services/uploader/routes'
import * as Sentry from '@sentry/node';

Sentry.init({
    dsn: "https://1b12ace826794ccda93012ee13d2ba0a@o310327.ingest.sentry.io/5544659",
    integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({tracing: true}),
    ],
    tracesSampleRate: 1.0,
});

declare global {
    interface Console {
        bgred: any,
        red: any
    }
}
console.bgred = function (data: string) {
    console.log('\x1b[41m' + data + '\x1b[0m')
}
console.red = function (data: string) {
    console.log('\x1b[31m' + data + '\x1b[0m')
}

if (process.env.CORE_HOST) {
    config.core_host = process.env.CORE_HOST.replace(/\/$/, "");
    console.bgred('Started with CORE_HOST ' + config.core_host,)
} else {
    console.bgred('Started without CORE_HOST')
}

const fastify: FastifyInstance = Fastify({logger: false, trustProxy: true})

declare module "fastify" {
    export interface FastifyRequest {
        jwtToken: string
    }
}

fastify.addHook("onRequest", async (request, reply) => {
    try {
        if (request.routerPath !== '/' && request.routerPath !== '/authorize' && request.routerPath !== '/authorization/prolong' && request.routerPath !== '/documentation/json') {

            if (request.headers.authorization && request.headers.authorization.toLowerCase().indexOf('bearer') > -1) {
                request.jwtToken = request.headers.authorization.substring(7).trim()

                // if (!authCache[token]) {
                //     return reply
                //         .code(401)
                //         .header('Content-Type', 'application/json; charset=utf-8')
                //         .send({"error": "Wrong token"})
                // }
                // const user = authCache[token]
                //
                // request.user = {
                //     jwtToken: token,
                //     userId: user.id,
                //     timeZoneOffset: user.timeZoneOffset || 0
                // }

                // console.log(request.user)
            }
        }
    } catch (err) {
        reply.send(err)
    }
})
//


fastify.register(require('fastify-swagger'), {
    exposeRoute: true,
    routePrefix: '/documentation',
    swagger: {
        info: {
            title: 'GATEWAY SERVICE',
            description: 'All micro-services',
            version: '1.0.0'
        },
        host: 'localhost:3123',
        schemes: "",
        consumes: ['application/json'],
        produces: ['application/json'],
        securityDefinitions: {
            "Authorization": {
                "type": "apiKey",
                "name": "Authorization",
                "in": "header"
            },
            acceptVersion: {
                type: 'apiKey',
                name: 'accept-version',
                description: 'version of API',
                in: 'header'
            }
        },
        security: [
            {'acceptVersion': []},
            {'Authorization': []}
        ]

    }
})

// Register fastify plugin to handle multipart uploads
fastify.register(require('fastify-multipart'), {
    limits: {
        fieldNameSize: 200, // Max field name size in bytes
        fieldSize: 10000,   // Max field value size in bytes
        fields: 10,         // Max number of non-file fields
        fileSize: FILE_SIZE, // For multipart forms, the max file size
        files: 1,           // Max number of file fields
    }
});


fastify.register(channelsServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(workspacesServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(usersServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(messagesServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(authorizationServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(infoServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(companiesServiceRoutes, {prefix: '/internal/mobile'})
fastify.register(uploadServiceRoutes, {prefix: '/internal/mobile'})


fastify.setErrorHandler(function (error: Error, request, reply) {
    // if (error instanceof HandledException) {
    //     reply.status(400).send({"error": (error as HandledException).message})
    // }


    if (error instanceof AssertionError) {
        reply.status(400).send({"error": (error as AssertionError).message})
    } else if (error instanceof Forbidden) {
        reply.status(403).send({"error": error.message})
    } else if (error instanceof BadRequest) {
        reply.status(400).send({"error": error.message})
    } else if ((error as any).validation) {
        reply.status(400).send({"error": error.message})
    } else if (error instanceof PayloadTooLarge) {
        reply.status(400).send({"error": error.message})
    } else {
        Sentry.captureException(error);
        console.error(error)
        reply.status(500).send({"error": "something went wrong"})
    }
})


const io = require('socket.io')(fastify.server);

// @ts-ignore
io.on('connection', function (socket) {
    console.log('on connection')
    socket.send('HELLO!')
    setInterval(() => {
        socket.send('PING ' + new Date().toISOString())
    }, 5000)
    socket.on('message', function () {
        console.log('on message')
    });
    socket.on('disconnect', function () {
        console.log('on disconnect')
    });
})


const start = async () => {


    try {
        await fastify.listen(3123, '::')


    } catch (err) {
        console.error(err)
        // fastify.log.error(err)
        process.exit(1)
    }
}


start()
