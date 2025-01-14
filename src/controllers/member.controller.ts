import express from 'express'

import User from '../models/user'

import { extractUserId } from '../utils/helpers.utils'
import { authenticate } from '../config/passport.config'
import { handleError, UserNotInRoom } from '../utils/errors.utils'

const app = express()

app.post('/:id/kick', authenticate, async (req, res) => {
    const { user } = req as { user: User }
    if(!user.room) return handleError(UserNotInRoom, res)

    const { id } = req.params

    if(typeof user.room === 'string')
        return res.status(500)

    if(extractUserId(user.room.owner) !== user.id)
        return res.status(401)

    try {
        const { members } = await user.room.fetchMembers(),
                member = members.find(({ id: userId }) => userId === id)
        if(!member) return res.status(409)

        await member.leaveRoom()

        res.sendStatus(200)
    } catch(error) {
        handleError(error, res)        
    }
})

app.post('/:id/report', authenticate, async (req, res) => res.sendStatus(200))

export default app