import { ComingSoon } from "../ComingSoon";
import { ChatIcon } from "../icons";

export default function ChatPage() {
  return (
    <ComingSoon icon={<ChatIcon />} title="AI chat">
      Onedlho sa tu spýtaš na čokoľvek k svojmu plánu a AI ti odpovie v kontexte tvojho profilu.
      Pri bolesti alebo zranení ťa vždy prepojí priamo s trénerom.
    </ComingSoon>
  );
}
