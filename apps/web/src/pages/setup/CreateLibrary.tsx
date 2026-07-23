import { Flex } from '@xon/ui'
import { css } from 'inline-css-modules'
import { useNavigate } from 'react-router-dom'
import CreateLibraryForm from '~/components/create-library-form/CreateLibraryForm'
import { styles as setupStyles } from './Setup'

const styles = css`
  .column {
    flex: 1;
  }

  .locationTextbox {
    margin-block-end: var(--space-2xs);
  }

  .image {
    mix-blend-mode: lighten;
    border-radius: var(--border-radius-5);
    corner-shape: var(--corner-shape);
    overflow: hidden;
  }
`

export default function CreateLibrary() {
  const navigate = useNavigate()

  return (
    <Flex align="start" justify="center" gap="6">
      <div className={styles.column}>
        <h4 className={setupStyles.heading}>Create your first Library.</h4>
        <p>
          Organize your media by creating a library. Xon will scan your media to
          discover metadata and create an editorial gallery experience
          automatically.
        </p>
        <img
          className={styles.image}
          src="src/static/images/create-library.png"
          alt=""
        />
      </div>
      <CreateLibraryForm onSuccess={() => navigate('/')} />
    </Flex>
  )
}
