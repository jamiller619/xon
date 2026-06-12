import { Button, Field, Flex, HorizontalRule, Textbox } from '@xon/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppleIcon, GoogleIcon } from '~/components/icons/brands'
import authClient from '~/lib/authClient'

export default function CreateUser({
  styles,
}: {
  styles: Record<string, string>
}) {
  const navigate = useNavigate()
  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const handleTransition = () => {
    setError(null)
    navigate('/setup', {
      replace: true,
      viewTransition: true,
    })
  }

  const handleSignUp = async () => {
    await authClient.signUp.email(
      {
        email,
        password,
        name: email.split('@').at(0) ?? 'User',
      },
      {
        onSuccess: handleTransition,
        onError(e) {
          setError(
            `Failed to sign up: ${e.error} ${JSON.stringify(e.request, null, 2)}, ${JSON.stringify(e.response, null, 2)}`,
          )
        },
      },
    )
  }

  const handleGoogleSignIn = async () => {
    await authClient.signIn.social(
      {
        provider: 'google',
      },
      {
        onSuccess: handleTransition,
        onError(e) {
          setError(
            `Failed to sign in with Google: ${e.error} ${JSON.stringify(e.request, null, 2)}, ${JSON.stringify(e.response, null, 2)}`,
          )
        },
      },
    )
  }

  const handleSkip = async () => {
    await authClient.signIn.anonymous({
      fetchOptions: {
        onSuccess: handleTransition,
        onError(e) {
          setError(
            `Failed to sign in anonymously: ${e.error} ${JSON.stringify(e.request, null, 2)}, ${JSON.stringify(e.response, null, 2)}`,
          )
        },
      },
    })
  }

  return (
    <Flex align="start" justify="center" gap="4">
      <div>
        <h1 className={styles.heading}>Create an account?</h1>
        <p>
          Accounts are not required to use Xon, however, they do provide several
          security benefits. You can always change this decision later.
        </p>
        <p>
          Accounts, like everything in Xon, are always and only stored locally.
        </p>
        {error && <p className={styles.error}>{error}</p>}
      </div>
      <form className={styles.form} onSubmit={handleSignUp}>
        <Field
          label="Name"
          description="Can be anything, or nothing at all. It's not required."
        >
          <Textbox
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
            value={name}
            block
          />
        </Field>
        <Field
          label="Email"
          description="Xon only uses this for authentication. We don't verify it in any way. If you want to use real email functionality you can configure an SMTP server."
        >
          <Textbox
            type="email"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            block
            required
          />
        </Field>
        <Field
          label="Password"
          description="Can be anything. No requirements. Restrictions can be configured later."
        >
          <Textbox
            type="password"
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            block
            required
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit">Sign up</Button>
        <HorizontalRule>or</HorizontalRule>
        <Button onClick={handleGoogleSignIn}>
          <GoogleIcon />
          Sign in with Google
        </Button>
        <Button onClick={handleGoogleSignIn}>
          <AppleIcon />
          Sign in with Apple
        </Button>
        <HorizontalRule>or</HorizontalRule>
        <Button onClick={handleSkip}>Skip; I don&apos;t need an account</Button>
      </form>
    </Flex>
  )
}
