import { initializeBobAgent } from "./agent-bob"
import { initializeAcmeAgent } from "./agent-acme"
import { setBobAgent, setAcmeAgent } from "./agent-store"
import { createNewInvitation } from "./create-invitation-credo"
import { setupConnectionListener } from "./listener-credo"
import { receiveInvitation } from "./recive-invitation-credo"

export const runTestCredo = async () => {
    console.log('Initializing Bob agent...')
    const bobAgent = await initializeBobAgent()
    setBobAgent(bobAgent)
    console.log('Initializing Acme agent...')
    const acmeAgent = await initializeAcmeAgent()
    setAcmeAgent(acmeAgent)

    // console.log('Creating the invitation as Acme...')
    // const { outOfBandRecord, invitationUrl } = await createNewInvitation(acmeAgent)
  
    // console.log('Listening for connection changes...')
    // setupConnectionListener(acmeAgent, outOfBandRecord, () =>
    //   console.log('We now have an active connection to use in the following tutorials')
    // )
  
    // console.log('Accepting the invitation as Bob...')
    // await receiveInvitation(bobAgent, invitationUrl)
}
  
