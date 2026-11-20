import { parseChatHistoryResponse } from "../../objects/curation/ChatHistoryResponse";
import type { ChatHistoryResponse } from "../../objects/curation/ChatHistoryResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 GetChatHistoryMessage（POST /api/getchathistory）。 */
export class GetChatHistoryAPI {
  constructor(readonly exhibitionId: string) {}

  send(): Promise<ChatHistoryResponse> {
    return send(
      { routeName: apiName("GetChatHistoryAPI"), body: { exhibitionId: this.exhibitionId } },
      parseChatHistoryResponse,
    );
  }
}
