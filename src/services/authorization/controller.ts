import {Forbidden} from "../../common/errors";
import AuthorizationService from "./service";
import {FastifyRequest} from "fastify";
import {AuthTypes} from "./types";
import assert from "assert";
import {authCache} from "../../common/simplecache";
import UsersService from "../users/service";
import InfoService from "../info/service";
import Axios from 'axios'
import * as https from "https";

const axios = Axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

export class AuthorizationController {

    constructor(
        protected authorizationService: AuthorizationService,
        protected userService: UsersService,
        protected infoService: InfoService
    ) {
    }

    async init(request: FastifyRequest<{ Body: AuthTypes.InitParams }>): Promise<any> {
        const {fcm_token, token, username, timezoneoffset} = request.body
        if (!token && !request.jwtToken) {
            throw new Forbidden('Token is not provided')
        }
        const res = await this.authorizationService.loginByToken(username, token, fcm_token, request.jwtToken)
        return this.doAuth(request.jwtToken, res, timezoneoffset)
    }


    async authorize(request: FastifyRequest<{ Body: AuthTypes.AuthParams }>): Promise<any> {

        const {username, password, device, fcm_token, timezoneoffset} = request.body

        const types = {'apple': 'apns', 'android': 'fcm'} as any

        assert(Object.keys(types).includes(device), "device should be in [" + Object.keys(types) + "]");


        let res = null;

        const info = await this.infoService.serverInfo()
        if (info.auth.console) {
            console.log(info.auth.console.mobile_endpoint_url)
            try {
                const r = await axios.get(process.env.AUTHORIZER_URL || "http://localhost:8000", {
                    params: {
                        endpoint: info.auth.console.mobile_endpoint_url,
                        login: username,
                        password: password
                    }
                })
                res = r.data.jwt
                // res = await this.authorizationService.loginByToken(username, token, fcm_token, request.jwtToken)
            } catch (e) {
                if (e.response && [401, 403].includes(e.response.status)) {
                    throw new Forbidden('Wrong credentials')
                } else {
                    throw e
                }
            }
        } else {
            res = await this.authorizationService.loginByPassword(username, password, fcm_token)

        }

        return this.doAuth(request.jwtToken, res, timezoneoffset)

    }

    async prolong(request: FastifyRequest<{ Body: AuthTypes.ProlongParams }>): Promise<any> {
        const {refresh_token, fcm_token, timezoneoffset} = request.body

        const res = await this.authorizationService.prolong(refresh_token, fcm_token)

        return this.doAuth(request.jwtToken, res, timezoneoffset)
    }

    async doAuth(currentJwtToken: string, data: { value: string, expiration: string, refresh: string, refresh_expiration: string }, timezoneoffset: number) {

        if (!data) {
            throw new Forbidden("Wrong credentials")
        }

        const token = data.value;

        if (currentJwtToken) {
            delete authCache[currentJwtToken]
        }
        authCache[token] = await this.userService.setJWTToken(token).getCurrent(timezoneoffset)

        return {
            "token": token,
            "expiration": data.expiration,
            "refresh_token": data.refresh,
            "refresh_expiration": data.refresh_expiration
        }
    }

    async logout(request: FastifyRequest<{ Body: AuthTypes.LogoutParams }>): Promise<any> {
        delete authCache[request.jwtToken]
        const {fcm_token} = request.body
        return await this.authorizationService.logout(fcm_token)
    }
}
