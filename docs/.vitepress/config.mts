import { withMermaid } from 'vitepress-plugin-mermaid'

const REPO_URL = 'https://github.com/prompt-agency/react-native-voice-activator'

export default withMermaid({
  title: 'react-native-voice-activator',
  description:
    'On-device wake word detection and managed multi-turn voice conversation sessions for React Native and Expo.',
  base: '/react-native-voice-activator/',
  srcExclude: ['CLAUDE.md', 'superpowers/**'],
  cleanUrls: true,
  // These are legitimate references to files outside the docs/ site root
  // (README.md, example/, GitHub Discussions, internal planning docs) and
  // cannot be resolved as site pages. Anything else stays a hard failure.
  ignoreDeadLinks: [/\.\.\/README/, /\.\.\/example/, /\/discussions$/, /_bmad-output/],

  head: [['link', { rel: 'icon', href: '/react-native-voice-activator/assets/logo.svg', type: 'image/svg+xml' }]],

  themeConfig: {
    logo: '/assets/logo.svg',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Conversation Session', link: '/conversation-session' },
      { text: 'Providers', link: '/examples/index' },
      { text: 'Troubleshooting', link: '/troubleshooting' },
      { text: 'GitHub', link: REPO_URL },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Overview', link: '/llm-context' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Bare React Native Setup', link: '/bare-react-native-setup' },
          { text: 'Expo Setup', link: '/expo-setup' },
          { text: 'iOS ONNX Conflict Resolution', link: '/ios-onnx-conflict-resolution' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Conversation Session', link: '/conversation-session' },
          { text: 'Background Behavior', link: '/background-behavior' },
          { text: 'Migration', link: '/migration' },
        ],
      },
      {
        text: 'Providers',
        items: [
          { text: 'Provider Examples Overview', link: '/examples/index' },
          { text: 'WhisperRN STT Provider', link: '/examples/whisper-stt-provider' },
          { text: 'Custom TTS Provider', link: '/examples/custom-tts-provider' },
          { text: 'Expo Speech Recognition STT Provider', link: '/examples/expo-speech-recognition-stt-provider' },
          { text: 'Expo Speech TTS Provider', link: '/examples/expo-speech-tts-provider' },
          { text: 'Platform-Conditional STT', link: '/examples/platform-conditional-stt' },
        ],
      },
      {
        text: 'Model Training',
        items: [
          { text: 'Wake Word Training', link: '/model-training/wake-word-training' },
          { text: 'TTS Voice Cloning', link: '/model-training/tts-voice-cloning' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Android Battery Optimization', link: '/android-battery-optimization' },
          { text: 'Android TTS Setup', link: '/android-tts-setup' },
          { text: 'App Store Submission', link: '/app-store-submission' },
          { text: 'Release Readiness', link: '/release-readiness' },
          { text: 'Reliability Validation', link: '/reliability-validation' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'Professional Services', link: '/professional-services' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: REPO_URL }],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: `${REPO_URL}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
  },
})
