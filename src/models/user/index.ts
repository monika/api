import IUser, { Role, DiscordCredentials } from './defs'

import Ban from './ban'
import Room from '../room'

import StoredUser from '../../schemas/user.schema'

import StoredBan from '../../schemas/ban.schema'
import { createPortal } from '../../drivers/portals.driver'

import StoredMessage from '../../schemas/message.schema'

import client from '../../config/redis.config'
import WSMessage from '../../server/websocket/models/message'
import { signToken, generateFlake } from '../../utils/generate.utils'
import { extractUserId, UNALLOCATED_PORTALS_KEYS } from '../../utils/helpers.utils'
import { UserNotFound, UserNotInRoom, TooManyMembers } from '../../utils/errors.utils'
import { fetchUserProfile, exchangeRefreshToken, constructAvatar } from '../../services/oauth2/discord.service'

export type UserResolvable = User | string

export default class User {
    id: string
    joinedAt: number
    username: string

    roles: Role[]
    
    name: string
    icon: string

    room?: Room | string

    constructor(json?: IUser) {
        if(!json) return

        this.setup(json)
    }

    load = (id: string) => new Promise<User>(async (resolve, reject) => {
        try {
            const doc = await StoredUser.findOne({ 'info.id': id })
            if(!doc) throw UserNotFound

            this.setup(doc)

            if(this.room)
                await this.fetchRoom()
            
            resolve(this)
        } catch(error) {
            reject(error)
        }
    })

    findOrCreate = (accessToken: string, refreshToken?: string, scopes?: string[]) => new Promise<User>(async (resolve, reject) => {
        try {
            const { id, email, username: name, avatar: avatarHash } = await fetchUserProfile(accessToken)

            const existing = await StoredUser.findOne({
                $and: [
                    {
                        'security.type': 'discord'
                    },
                    {
                        'security.credentials.userId': id
                    }
                ]
            }), avatar = constructAvatar({ userId: id, email, hash: avatarHash })

            if(existing) {
                this.setup(existing)

                await StoredUser.updateOne({
                    'info.id': this.id
                }, {
                    $set: {
                        'profile.name': name,
                        'profile.icon': avatar,

                        'security.credentials.email': email,
                        'security.credentials.scopes': scopes,
                        'security.credentials.accessToken': accessToken,
                        'security.credentials.refreshToken': refreshToken
                    }
                })
                
                resolve(this)
            } else {
                const json: IUser = {
                    info: {
                        id: generateFlake(),
                        joinedAt: Date.now(),
                        username: name,
                        roles: []
                    },
                    security: {
                        type: 'discord',
                        credentials: {
                            userId: id,
                            email,

                            scopes,
                            accessToken,
                            refreshToken
                        }
                    },
                    profile: {
                        name,
                        icon: avatar
                    }
                }

                const stored = new StoredUser(json)
                await stored.save()

                this.setup(json)

                resolve(this)
            }
        } catch(error) {
            reject(error)
        }
    })

    refreshProfile = () => new Promise<User>(async (resolve, reject) => {
        try {
            const { security: { credentials } } = await StoredUser.findOne({ 'info.id': this.id })
            const { refreshToken } = (credentials as DiscordCredentials)

            const { access_token, refresh_token } = await exchangeRefreshToken(refreshToken)
            const { id, username: name, email, avatar: avatarHash } = await fetchUserProfile(access_token)

            const icon = constructAvatar({
                userId: id,
                email,

                hash: avatarHash
            })

            await StoredUser.updateOne({
                'info.id': this.id
            }, {
                $set: {
                    'security.credentials.accessToken': access_token,
                    'security.credentials.refreshToken': refresh_token,

                    'profile.name': name,
                    'profile.icon': icon
                }
            })

            this.name = name
            this.icon = icon

            if(this.room) {
                const message = new WSMessage(0, this, 'USER_UPDATE')
                message.broadcastRoom(this.room, [ this.id ])
            }

            resolve(this)
        } catch(error) {
            reject(error)
        }
    })

    signToken = () => new Promise<string>(async (resolve, reject) => {
        try {
            const { id } = this, token = await signToken({ id })

            resolve(token)
        } catch(error) {
            reject(error)
        }
    })

    fetchRoom = () => new Promise<User>(async (resolve, reject) => {
        if(!this.room) return reject(UserNotInRoom)

        const roomId = typeof this.room === 'string' ? this.room : this.room.id

        try {
            const room = await new Room().load(roomId)
            this.room = room

            resolve(this)
        } catch(error) {
            reject(error)
        }
    })

    fetchBan = () => new Promise<Ban>(async (resolve, reject) => {
        try {
            const doc = await StoredBan.findOne({
                $and: [
                    {
                        'info.active': true
                    },
                    {
                        'data.userId': this.id
                    }
                ]
            })
            if(!doc) return resolve(null)

            const ban = new Ban(doc)
            resolve(ban)
        } catch(error) {
            reject(error)
        }
    })

    joinRoom = (room: Room, isInitialMember: boolean = false) => new Promise<User>(async (resolve, reject) => {
        try {
            if(!room.members)
                await room.fetchMembers()

            if(room.members && room.members.length >= 10)
                throw TooManyMembers

            await StoredUser.updateOne({
                'info.id': this.id
            }, {
                $set: {
                    'info.room': room.id
                }
            })

            /**
             * The local instance of the room has not been updated for this user,
             * so we will check if there is only 1 member in the room before the update
             */

            if(!isInitialMember &&
                room.members &&
                room.members.length === 1 &&
                UNALLOCATED_PORTALS_KEYS.indexOf(room.portal.status) > -1)
                createPortal(room)

            const message = new WSMessage(0, {...this, room: undefined }, 'USER_JOIN')
            message.broadcastRoom(room)

            this.room = room

            resolve(this)
        } catch(error) {
            reject(error)
        }
    })

    leaveRoom = () => new Promise<User>(async (resolve, reject) => {
        try {
            if(typeof this.room === 'string') await this.fetchRoom()
            if(typeof this.room === 'string') return

            await this.room.fetchMembers()

            /**
             * In this instance, the WebSocket message is sent before the DB
             * update. This is because the client needs to recieve the message
             * that the user has left the room, and any state changes on the
             * client side to handle the room being left needs to be ran
             */
            const memberIndex = this.room.members.map(({ id }) => id).indexOf(this.id)
            this.room.members.splice(memberIndex, 1)

            if(this.room.members.length === 0)
                await this.room.destroy()
            else {
                const leavingUserIsOwner = this.id === extractUserId(this.room.owner)

                if(leavingUserIsOwner)
                    this.room.transferOwnership(this.room.members[0])

                const message = new WSMessage(0, { u: this.id }, 'USER_LEAVE')
                message.broadcastRoom(this.room)
            }

            await StoredUser.updateOne({
                'info.id': this.id
            }, {
                $unset: {
                    'info.room': ''
                }
            })

            client.hset('undelivered_events', this.id, JSON.stringify([]))

            delete this.room

            resolve(this)
        } catch(error) {
            reject(error)
        }
    })

    destroy = () => new Promise(async (resolve, reject) => {
        try {
            if(this.room)
                await this.leaveRoom()

            await StoredUser.deleteOne({
                'info.id': this.id
            })

            await StoredMessage.deleteMany({
                'info.author': this.id
            })

            resolve()
        } catch(error) {
            reject(error)
        }
    })

    setup = (json: IUser) => {
        this.id = json.info.id
        this.joinedAt = json.info.joinedAt
        this.username = json.info.username

        this.roles = json.info.roles

        this.name = json.profile.name
        this.icon = json.profile.icon

        if(!this.room) this.room = json.info.room
    }

    prepare = () => ({ ...this } as User)
}