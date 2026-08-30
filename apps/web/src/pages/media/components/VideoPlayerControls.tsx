import {
  Captions,
  Controls,
  FullscreenButton,
  Gesture,
  MuteButton,
  PIPButton,
  PlayButton,
  SeekButton,
  Time,
  TimeSlider,
  useAudioOptions,
  useCaptionOptions,
  useMediaState,
  VolumeSlider,
} from '@vidstack/react'
import { Select } from '@xon/ui'
import { type ChangeEvent, type ComponentProps, useId } from 'react'
import { PauseIcon, PlayIcon, SoundIcon } from '~/components/icons/playback'
import styles from './VideoPlayerControls.module.css'

type IconProps = ComponentProps<'svg'>

function SeekBackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M9.4 6.2 5.6 9.9l3.8 3.8v-2.6h4.1a4 4 0 1 1-3.6 5.8l-1.7.9a6 6 0 1 0 5.3-8.7H9.4V6.2Z" />
      <path d="M11.3 13.2h1.5V18h-1.5zM14.1 13.2h1.5V18h-1.5z" />
    </svg>
  )
}

function SeekForwardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m14.6 6.2 3.8 3.7-3.8 3.8v-2.6h-4.1a4 4 0 1 0 3.6 5.8l1.7.9a6 6 0 1 1-5.3-8.7h4.1V6.2Z" />
      <path d="M8.4 13.2h1.5V18H8.4zM11.2 13.2h1.5V18h-1.5z" />
    </svg>
  )
}

function FullscreenIcon({ active, ...props }: IconProps & { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      {active ? (
        <path d="M9 4v5H4v2h7V4H9Zm6 0v7h7V9h-5V4h-2ZM4 15v2h5v5h2v-7H4Zm13 0h-2v7h2v-5h5v-2h-5Z" />
      ) : (
        <path d="M4 4v7h2V6h5V4H4Zm9 0v2h5v5h2V4h-7ZM4 13v7h7v-2H6v-5H4Zm14 0v5h-5v2h7v-7h-2Z" />
      )}
    </svg>
  )
}

function PictureInPictureIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13Zm2 0v13c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5v-13c0-.3-.2-.5-.5-.5h-13c-.3 0-.5.2-.5.5ZM11 11h6v5h-6v-5Z" />
    </svg>
  )
}

function TrackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2v8h14V8H5Zm2 2h4v2H9v2h2v2H7v-6Zm6 0h4v2h-2v2h2v2h-4v-6Z" />
    </svg>
  )
}

function AudioTrackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M14 4v10.1a4 4 0 1 1-2-3.5V6l8-2v8.1a4 4 0 1 1-2-3.5V6.5L14 7.6V4Zm-4 8.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  )
}

function selectOption<
  T extends { value: string; select(trigger?: Event): void },
>(options: readonly T[], event: ChangeEvent<HTMLSelectElement>) {
  options
    .find((option) => option.value === event.currentTarget.value)
    ?.select(event.nativeEvent)
}

export default function VideoPlayerControls({
  title,
  mediaType,
}: {
  title: string
  mediaType: string
}) {
  const paused = useMediaState('paused')
  const muted = useMediaState('muted')
  const volume = useMediaState('volume')
  const fullscreen = useMediaState('fullscreen')
  const pictureInPicture = useMediaState('pictureInPicture')
  const canPictureInPicture = useMediaState('canPictureInPicture')
  const waiting = useMediaState('waiting')
  const captionOptions = useCaptionOptions({ off: 'Off' })
  const audioOptions = useAudioOptions()
  const audioTrackId = useId()
  const captionTrackId = useId()

  return (
    <>
      <div className={styles.gestures} aria-hidden="true">
        <Gesture
          className={styles.gesture}
          event="pointerup"
          action="toggle:paused"
        />
        <Gesture
          className={styles.touchGesture}
          event="pointerup"
          action="toggle:controls"
        />
        <Gesture
          className={styles.gesture}
          event="dblpointerup"
          action="toggle:fullscreen"
        />
        <Gesture
          className={styles.seekBackGesture}
          event="dblpointerup"
          action="seek:-10"
        />
        <Gesture
          className={styles.seekForwardGesture}
          event="dblpointerup"
          action="seek:10"
        />
      </div>

      <Captions className={styles.captions} />

      {waiting && (
        <div className={styles.buffering} role="status" aria-label="Buffering">
          <span className={styles.spinner} aria-hidden="true" />
        </div>
      )}

      <Controls.Root className={styles.controls}>
        <Controls.Group className={styles.controlBar}>
          <div className={styles.trackInfo}>
            <span className={styles.trackTitle} title={title}>
              {title}
            </span>
            <span className={styles.trackType}>{mediaType}</span>
          </div>

          <div className={styles.transport}>
            <SeekButton
              className={styles.controlButton}
              seconds={-10}
              title="Back 10 seconds"
              aria-label="Back 10 seconds"
            >
              <SeekBackIcon />
            </SeekButton>
            <PlayButton
              className={styles.playButton}
              title={paused ? 'Play' : 'Pause'}
              aria-label={paused ? 'Play' : 'Pause'}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </PlayButton>
            <SeekButton
              className={styles.controlButton}
              seconds={10}
              title="Forward 10 seconds"
              aria-label="Forward 10 seconds"
            >
              <SeekForwardIcon />
            </SeekButton>
          </div>

          <div className={styles.seekArea}>
            <Time className={styles.timeLabel} type="current" />
            <TimeSlider.Root className={styles.seekSlider} aria-label="Seek">
              <TimeSlider.Track className={styles.sliderTrack}>
                <TimeSlider.Progress className={styles.sliderProgress} />
                <TimeSlider.TrackFill className={styles.sliderFill} />
              </TimeSlider.Track>
              <TimeSlider.Thumb className={styles.sliderThumb} />
            </TimeSlider.Root>
            <Time className={styles.timeLabel} type="duration" />
          </div>

          <div className={styles.volumeArea}>
            <MuteButton
              className={styles.controlButton}
              title={muted || volume === 0 ? 'Unmute' : 'Mute'}
              aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
            >
              <SoundIcon volume={muted ? 0 : volume} />
            </MuteButton>
            <VolumeSlider.Root
              className={styles.volumeSlider}
              aria-label="Volume"
            >
              <VolumeSlider.Track className={styles.sliderTrack}>
                <VolumeSlider.TrackFill className={styles.sliderFill} />
              </VolumeSlider.Track>
              <VolumeSlider.Thumb className={styles.sliderThumb} />
            </VolumeSlider.Root>
          </div>

          <div className={styles.videoActions}>
            {!audioOptions.disabled && audioOptions.length > 1 && (
              <label className={styles.trackPicker} htmlFor={audioTrackId}>
                <AudioTrackIcon />
                <span className={styles.visuallyHidden}>Audio track</span>
                <Select
                  id={audioTrackId}
                  className={styles.trackSelect}
                  size="small"
                  value={audioOptions.selectedValue}
                  onChange={(event) => selectOption(audioOptions, event)}
                  aria-label="Audio track"
                  title="Audio track"
                >
                  {audioOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            {!captionOptions.disabled && (
              <label className={styles.trackPicker} htmlFor={captionTrackId}>
                <TrackIcon />
                <span className={styles.visuallyHidden}>Subtitles</span>
                <Select
                  id={captionTrackId}
                  className={styles.trackSelect}
                  size="small"
                  value={captionOptions.selectedValue}
                  onChange={(event) => selectOption(captionOptions, event)}
                  aria-label="Subtitles"
                  title="Subtitles"
                >
                  {captionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            {canPictureInPicture && (
              <PIPButton
                className={styles.controlButton}
                title={
                  pictureInPicture
                    ? 'Exit picture in picture'
                    : 'Picture in picture'
                }
                aria-label={
                  pictureInPicture
                    ? 'Exit picture in picture'
                    : 'Picture in picture'
                }
              >
                <PictureInPictureIcon />
              </PIPButton>
            )}

            <FullscreenButton
              className={styles.controlButton}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <FullscreenIcon active={fullscreen} />
            </FullscreenButton>
          </div>
        </Controls.Group>
      </Controls.Root>
    </>
  )
}
