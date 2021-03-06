import {arrayToObject} from "../../common/helpers";
import {authCache} from "../../common/simplecache";
import {ChannelsTypes} from "./types";
import {FastifyRequest} from "fastify";
import ChannelsService from "./service";
import UsersService from "../users/service";
import {BadRequest} from "../../common/errors";

import emojis from '../../resources/emojis'

const trim = (str: string, chr: string) => str.replace(new RegExp("^[" + chr + "]+|[" + chr + "]+$", "g"), "");

function __channelFormat(a: any): ChannelsTypes.Channel {

    const userRole = a.user_is_organization_administrator ? 'ADMIN' : a.owner === a.user_member.user_id ? 'CREATOR' : 'OTHER'

    let permissions = []

    switch (userRole) {
        case "ADMIN":
        case "CREATOR":
            permissions = ['UPDATE_NAME', 'UPDATE_DESCRIPTION', 'ADD_MEMBER', 'REMOVE_MEMBER', 'UPDATE_PRIVACY', 'DELETE_CHANNEL']
            break
        case "OTHER":
            permissions = ['UPDATE_NAME', 'UPDATE_DESCRIPTION', 'ADD_MEMBER', 'REMOVE_MEMBER']
            break
        // case "GUEST":
        //     permissions = []
        //     break
    }

    return {
        id: a.id,
        name: a.name ? a.name.charAt(0).toUpperCase() + a.name.slice(1) : a.name,
        icon: a.icon && a.icon.startsWith(':') ? emojis[trim(a.icon, ':')] || '' : a.icon,
        // icon: a.icon,
        company_id: a.company_id,
        workspace_id: a.workspace_id,
        description: a.description,
        channel_group: a.channel_group,
        last_message: a.last_message && Object.keys(a.last_message).length > 0 ? a.last_message : null,
        last_activity: +a.last_activity,
        has_unread: a.user_member ? +a.last_activity > +a.user_member.last_access : false,
        user_last_access: a.user_member ? +a.user_member.last_access : undefined,
        members: a.members,
        visibility: a.visibility,
        is_member: Boolean(a.user_member),
        permissions: permissions
    } as ChannelsTypes.Channel
}

function __channelsFormat(source: any): ChannelsTypes.Channel[] {
    return source.map((a: any) => {
        return __channelFormat(a)
    })
}


function eqArrays(as: string[], bs: string[]) {
    if (as.length !== bs.length) return false;
    const bsSet = new Set(bs)
    for (let a of as) if (!bsSet.has(a)) return false;
    return true;
}


export class ChannelsController {

    constructor(protected channelsService: ChannelsService, protected usersService: UsersService) {
    }

    async addDirect(request: FastifyRequest<{ Body: ChannelsTypes.AddDirectRequest }>) {
        const {company_id, member} = request.body
        const current_user = await this.usersService.getCurrent()
        const members = [member, current_user.id]
        let channel = await this.channelsService.getDirects(company_id)
            .then(data => data.find((a: any) => !a.name && a.members.length && eqArrays(members, a.members)))
        if (!channel) {
            channel = await this.channelsService.addChannel(company_id, 'direct', '', 'direct', members, '', '', '', undefined)
        }
        return this.__formatDirectChannels([__channelFormat(channel)]).then(a => a[0])
    }

    async add(request: FastifyRequest<{ Body: ChannelsTypes.AddRequest }>): Promise<any> {
        let {company_id, workspace_id, visibility, name, members, channel_group, description, icon, is_default} = request.body

        if(visibility === 'public' && is_default === undefined){
            is_default = false
        }

        const channel = await this.channelsService.addChannel(company_id, workspace_id, name, visibility, members, channel_group, description, icon, is_default)
        channel.members = await this.channelsService.getMembers(company_id, workspace_id, channel.id)
                                .then((mms: {[key: string]: any}[]) => mms.map((m) => m.id))
        return __channelFormat(channel)
    }

    async addEmailsToMembers(members: any) {

        const promises = members.map((member: any) => this.usersService.getUserById(member.id))
        const users = await Promise.all(promises.map((p: any) => p.catch(() => null))).then(a => a.filter(a => a))

        const membersMap = {} as { [key: string]: any }
        members.forEach((member: any) => {
            membersMap[member.id] = member
        })

        const res = [] as any[]
        users.forEach((user: any) => {
            const member = membersMap[user.id]
            console.log('adding email', user.email)
            member['email'] = user.email
            res.push(member)
        })

        return res
    }

    async public(request: FastifyRequest<{ Querystring: ChannelsTypes.PublicChannelsListParameters }>): Promise<ChannelsTypes.Channel[]> {
        const {company_id, workspace_id, all} = request.query

        const channels = await this.channelsService.public(company_id, workspace_id, false) as any[]

        if (all) {
            // const existed_channels_id = channels.reduce((acc, curr) => (acc[curr.id] = true, acc), {});
            const existed_channels_id = new Set(channels.map(a => a.id))
            await this.channelsService.public(company_id, workspace_id, true).then(
                (all_channels: any) => all_channels.filter((a: any) => !existed_channels_id.has(a.id))
                    .forEach((a: any) => channels.push(a)))
        }

        await Promise.all(
            channels.map((c) => 
                this.channelsService.getMembers(company_id, workspace_id, c.id)
                .then((mms: {[key: string]: any}[]) => {
                    const members = mms.map((m) => m.id)
                    c.members = members
                })
            )
        )

        const user = await this.usersService.getCurrent()
        channels.forEach((ch: any) => {
            ch.user_is_organization_administrator = user.is_admin
        })
        return __channelsFormat(channels).sort((a: any, b: any) => a.name.localeCompare(b.name))
    }

    async getMembers(request: FastifyRequest<{ Querystring: ChannelsTypes.ChannelParameters }>) {
        const {company_id, workspace_id, id} = request.query
        return this.channelsService.getMembers(company_id, workspace_id, id).then((a: any) => this.addEmailsToMembers(a))
    }

    async addMembers(request: FastifyRequest<{ Body: ChannelsTypes.ChangeMembersRequest }>): Promise<any> {
        const {company_id, workspace_id, id} = request.body
        await this.channelsService.addMembers(request.body)
        return this.channelsService.getMembers(company_id, workspace_id, id).then((a: any) => this.addEmailsToMembers(a))
    }

    async removeMembers(request: FastifyRequest<{ Body: ChannelsTypes.ChangeMembersRequest }>): Promise<any> {
        const {company_id, workspace_id, id} = request.body

        await this.channelsService.removeMembers(request.body)
        return this.channelsService.getMembers(company_id, workspace_id, id).then((a: any) => this.addEmailsToMembers(a))
    }

    edit(request: FastifyRequest<{ Body: ChannelsTypes.UpdateRequest }>) {
        return this.channelsService.update(request.body)
    }

    async delete(request: FastifyRequest<{ Body: ChannelsTypes.ChannelParameters }>) {
        // channel deletion has a bug we need to double check the deletion
        const res = await this.channelsService.delete(request.body)
        let done = false
        let attempts = 0
        while (!done) {
            const channels = await this.channelsService.all(request.body)
            const found = channels.find(a => a.id === request.body.id)
            if (found) {
                if (attempts > 2) throw new BadRequest("Can't delete channel after 3 requests")
                await this.channelsService.delete(request.body)
                attempts++
            } else {
                done = true
            }
        }

        return res
    }

    init(request: FastifyRequest<{ Querystring: ChannelsTypes.ChannelParameters }>) {
        return this.channelsService.init(request.query)
    }

    async direct(request: FastifyRequest<{ Querystring: ChannelsTypes.BaseChannelsParameters }>) {
        const data = await this.channelsService.getDirects(request.query.company_id)
        const res = __channelsFormat(data)
            .filter(a => a.members.length > 0)
            .sort((d1, d2) => d2.last_activity - d1.last_activity)
        return this.__formatDirectChannels(res)
    }

    async markRead(request: FastifyRequest<{ Body: ChannelsTypes.ChannelParameters }>) {
        const req = request.body
        return this.channelsService.markRead(req.company_id, req.workspace_id, req.id)
    }

    private async __formatDirectChannels(items: any[]) {
        const usersIds = new Set()

        items.forEach((c: any) => {
            c.members.forEach((m: string) => {
                usersIds.add(m)
            })
        })
        const usersHash = arrayToObject(await Promise.all(Array.from(usersIds.values())
            .map((user_id) => this.usersService.getUserById(user_id as string))), 'id')
        const currentUserToken = authCache[this.usersService.getJwtToken()]
            ? authCache[this.usersService.getJwtToken()]['id']
            : await this.usersService.getCurrent().then(a => a.id)

        return items.map((a: ChannelsTypes.Channel) => {
            if (a.members) {
                const members = (a.members.length > 1) ? a.members.filter((a: string) => a != currentUserToken) : a.members
                a.name = members.map((a: string) => {
                    const u = usersHash[a]
                    return u.firstname + ' ' + u.lastname
                }).join(', ')
                a.members = members as any
            }
            return a
        })
    }


}
