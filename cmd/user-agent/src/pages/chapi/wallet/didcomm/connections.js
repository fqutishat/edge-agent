/*
Copyright SecureKey Technologies Inc. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
*/

import axios from 'axios';
import {POST_STATE, waitForEvent} from "../../../../events";

const routerCreateInvitationPath = `/outofband/create-invitation`
const stateCompleted = 'completed'
const topicDidExchangeStates = 'didexchange_states'

/**
 * AgentMediator provides aries mediator features
 * @param aries agent instance
 * @class
 */
export class AgentMediator {
    constructor(aries) {
        this.aries = aries
    }

    async connect(endpoint) {
        let invitation = await createInvitationFromRouter(endpoint)

        let conn = await this.aries.outofband.acceptInvitation({
            my_label: 'agent-default-label',
            invitation: invitation,
        })

        let connID = conn['connection_id']

        await waitForEvent(this.aries, {
            type: POST_STATE,
            stateID: stateCompleted,
            connectionID: connID,
            topic: topicDidExchangeStates,
        })

        await this.aries.mediator.register({connectionID: connID})

        let res = await this.aries.mediator.getConnection().catch(err => {
            if (!err.message.includes("router not registered")) {
                throw err
            }
        })

        console.log("router registered successfully..!!", res.connectionID)

        // return handle for disconnect
        return () => this.aries.mediator.unregister()
    }

    async reconnect() {
        try {
            let res = await this.aries.mediator.getConnection()
            await this.aries.mediator.reconnect({connectionID: res.connectionID})
        } catch (e) {
            console.error('unable to reconnect to router', e)
        }
    }

    async isAlreadyConnected() {
        let res
        try {
            res = await this.aries.mediator.getConnection()
        } catch (e) {
            if (e.toString().includes("router not registered")) {
                return false
            }

            throw e
        }

        return res.connectionID != ""
    }

    async createInvitation() {
        // creates invitation through the out-of-band protocol
        let response = await this.aries.outofband.createInvitation({label: 'agent-label'})

        return response.invitation
    }
}

const createInvitationFromRouter = async (endpoint) => {
    const response = await axios.post(`${endpoint}${routerCreateInvitationPath}`, {label: 'mediator-label'})
    return response.data.invitation
}