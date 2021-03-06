/*
Copyright SecureKey Technologies Inc. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
*/

import {getCredentialType} from '../common/util.js';
import {WalletManager} from "..";

/**
 * WalletStore provides CHAPI store features
 * @param aries instance & credential event
 * @class
 */
export class WalletStore {
    constructor(aries, trustblocAgent, trustblocStartupOpts, credEvent) {
        this.aries = aries
        this.trustblocAgent = trustblocAgent
        this.trustblocStartupOpts = trustblocStartupOpts
        this.credEvent = credEvent
    }

    async saveCredential(name, credential, isVC) {
        let records = []
        if (isVC) {
            records.push({name, credential})
        } else {
            const vcs = Array.isArray(credential.verifiableCredential) ? credential.verifiableCredential : [credential.verifiableCredential]
            const useSuffix = vcs.length > 1

            vcs.forEach((vc, i) => {
                const frName = useSuffix ? `${name}_${getCredentialType(vc.type)}_${++i}` : name
                records.push({name: frName, credential: vc})
            })
        }

        // Call aries to save credentials
        let status = 'success'
        try {
            for (let r of records) {
                await this.save(r.name, r.credential)
            }
        } catch (e) {
            status = e.toString()
        }

        console.log(`sending status response with status ${status}`)

        // Call Credential Handler callback
        this.credEvent.respondWith(new Promise(function (resolve) {
            return resolve({
                dataType: "Response",
                data: status
            });
        }))
    }

    async save(name, vcData) {
        await this.aries.verifiable.saveCredential({
            name: name,
            verifiableCredential: JSON.stringify(vcData)
        }).then(() => {
                console.log('successfully saved VC:', name)
            }
        ).catch(err => {
            console.log(`vc save failed for ${name} : errMsg=${err}`)
            throw err
        })

        if (this.trustblocStartupOpts.sdsServerURL) {
            const registeredUser = await new WalletManager().getRegisteredUser()

            if (!registeredUser) {
                const notLoggedInErrorMsg = "Unable to save credential to SDS since the user is not logged in."
                console.error(notLoggedInErrorMsg)
                throw notLoggedInErrorMsg
            }

           // Save credential to persistent storage
           // TODO: Deal with SDS sync failures better #328
           await this.trustblocAgent.credentialclient.saveCredential({
                name: name,
                credential: vcData,
                userID: registeredUser.id
            })
        } else {
            console.log("Skipping credential storage to SDS since no SDS server URL was configured.")
        }
    }

    async savePresentation(name, presentation) {
       if (this.trustblocStartupOpts.sdsServerURL) {
           const registeredUser = await new WalletManager().getRegisteredUser()

           if (!registeredUser) {
               const notLoggedInErrorMsg = "Unable to save presentation to SDS since the user is not logged in."
               console.error(notLoggedInErrorMsg)
               throw notLoggedInErrorMsg
           }

            const t = await new this.trustblocAgent.Framework(this.trustblocStartupOpts)

            // Save presentation to persistent storage
            // TODO: Deal with SDS sync failures better #328
            await t.presentationclient.savePresentation({
                name: name,
                presentation: presentation,
                userID: registeredUser.id
            })
        } else {
            console.log("Skipping presentation storage to SDS since no SDS server URL was configured.")
        }
    }

    cancel() {
        this.credEvent.respondWith(new Promise(function (resolve) {
            return resolve({
                dataType: "Response",
                data: 'cancelled'
            });
        }))
    }
}
