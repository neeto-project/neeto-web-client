import { FunctionComponent } from 'preact';
import {
  Title,
  Subtitle,
  Text,
  LinkButton,
  PreferencesGroup,
  PreferencesPane,
  PreferencesSegment,
} from '../components';

export const HelpAndFeedback: FunctionComponent = () => (
  <PreferencesPane>
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Frequently asked questions</Title>
        <div className="h-2 w-full" />
        <Subtitle>Who can read my private notes?</Subtitle>
        <Text>
          Quite simply: no one but you. Not us, not your ISP, not a hacker, and
          not a government agency. As long as you keep your password safe, and
          your password is reasonably strong, then you are the only person in
          the world with the ability to decrypt your notes. For more on how we
          handle your privacy and security, check out our easy to read{' '}
          <a target="_blank" href="https://standardnotes.com/privacy">
            Privacy Manifesto.
          </a>
        </Text>
      </PreferencesSegment>
      <PreferencesSegment>
        <Subtitle>Can I collaborate with others on a note?</Subtitle>
        <Text>
          Because of our encrypted architecture, Standard Notes does not
          currently provide a real-time collaboration solution. Multiple users
          can share the same account however, but editing at the same time may
          result in sync conflicts, which may result in the duplication of
          notes.
        </Text>
      </PreferencesSegment>
      <PreferencesSegment>
        <Subtitle>Can I use Standard Notes totally offline?</Subtitle>
        <Text>
          Standard Notes can be used totally offline without an account, and
          without an internet connection. You can find{' '}
          <a
            target="_blank"
            href="https://standardnotes.com/help/59/can-i-use-standard-notes-totally-offline"
          >
            more details here.
          </a>
        </Text>
      </PreferencesSegment>
      <PreferencesSegment>
        <Subtitle>Can’t find your question here?</Subtitle>
        <LinkButton label="Open FAQ" link="https://standardnotes.com/help" />
      </PreferencesSegment>
    </PreferencesGroup>
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Community forum</Title>
        <Text>
          If you have an issue, found a bug or want to suggest a feature, you
          can browse or post to the forum. It’s recommended for non-account
          related issues. Please read our{' '}
          <a target="_blank" href="https://standardnotes.com/longevity/">
            Longevity statement
          </a>{' '}
          before advocating for a feature request.
        </Text>
        <LinkButton
          label="Go to the forum"
          link="https://forum.standardnotes.org/"
        />
      </PreferencesSegment>
    </PreferencesGroup>
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Slack group</Title>
        <Text>
          Want to meet other passionate note-takers and privacy enthusiasts?
          Want to share your feedback with us? Join the Standard Notes Slack
          group for discussions on security, themes, editors and more.
        </Text>
        <LinkButton
          link="https://standardnotes.com/slack"
          label="Join our Slack group"
        />
      </PreferencesSegment>
    </PreferencesGroup>
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Account related issue?</Title>
        <Text>
          Send an email to help@standardnotes.org and we’ll sort it out.
        </Text>
        <LinkButton link="mailto: help@standardnotes.org" label="Email us" />
      </PreferencesSegment>
    </PreferencesGroup>
  </PreferencesPane>
);
