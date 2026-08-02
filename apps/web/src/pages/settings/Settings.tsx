import Form from '@rjsf/core'
import type { RJSFSchema } from '@rjsf/utils'
import validator from '@rjsf/validator-ajv8'
import { schema } from '@xon/shared'
import Page from '../Page'

const log = (type: string) => console.log.bind(console, type)

export default function Settings() {
  return (
    <Page>
      <Page.Title>Settings</Page.Title>
      <Form
        schema={schema as RJSFSchema}
        validator={validator}
        onChange={log('changed')}
        onSubmit={log('submitted')}
        onError={log('errors')}
      />
    </Page>
  )
}
