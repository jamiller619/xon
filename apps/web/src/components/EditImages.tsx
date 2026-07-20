import { Flex } from '@xon/ui'
import { css } from 'inline-css-modules'

type ImagesMetadata = {
  backdrop?: string | string[]
  logo?: string | string[]
  poster?: string | string[]
}

const styles = css`
  .image {
    width: 100px;
    height: 100px;
  }
`

export default function EditImages({
  images,
}: {
  images?: ImagesMetadata | undefined
}) {
  return (
    <Flex dir="col">
      {images?.poster && <ImageRow images={images?.poster} title="Poster" />}
      <div>
        {images?.backdrop && (
          <ImageRow images={images?.backdrop} title="Backdrop" />
        )}
        {images?.logo && <ImageRow images={images?.logo} title="Logo" />}
      </div>
    </Flex>
  )
}

function ImageRow({
  images,
  title,
}: {
  images?: string | string[] | undefined
  title: string
}) {
  const urls = Array.isArray(images) ? images : images ? [images] : []

  return (
    <Flex dir="col">
      <h6>{title}</h6>
      <Flex>
        {urls.map((img) => (
          <img className={styles.image} key={img} src={img} alt="" />
        ))}
      </Flex>
    </Flex>
  )
}
