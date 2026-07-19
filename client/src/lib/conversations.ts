/**
 * Conversation creation/membership with Conversation-Key (CK) provisioning
 * (docs/ENCRYPTION.md, "Membership changes"). Every create/add seals a CK to
 * the affected members' identity keys before the server will accept it; removal
 * rotates the CK forward to the remaining members. Shared by the sidebar and
 * the modals so the CK handling lives in exactly one place.
 */
import api from './api';
import {
  generateCK,
  sealCKToMembers,
  fetchMemberKey,
  primeCK,
  getCK,
  type MemberKey,
} from './crypto/conversationKeys';

/** Per-member conversation actions (mute/block/delete). No CK work — plain flags. */
export const muteConversation = (id: string) => api.post(`/conversations/${id}/mute`);
export const unmuteConversation = (id: string) => api.delete(`/conversations/${id}/mute`);
export const blockConversation = (id: string) => api.post(`/conversations/${id}/block`);
export const unblockConversation = (id: string) => api.delete(`/conversations/${id}/block`);
export const deleteConversation = (id: string, opts: { deleteHistory?: boolean; forEveryone?: boolean } = {}) =>
  api.delete(`/conversations/${id}`, { data: opts });
export const clearConversationHistory = (id: string, opts: { forEveryone?: boolean } = {}) =>
  api.post(`/conversations/${id}/clear`, opts);

/** Get-or-create a DM, provisioning a sealed CK for both members on create. */
export const createDirectConversation = async (selfId: string, targetUserId: string) => {
  const [me, target] = await Promise.all([fetchMemberKey(selfId), fetchMemberKey(targetUserId)]);
  const ck = generateCK();
  const wrappedKeys = sealCKToMembers(ck, [me, target]);
  const res = await api.post('/conversations/dm', { targetUserId, wrappedKeys });
  const conv = res.data;
  // Cache our CK only when we actually created it (201); an existing DM (200)
  // already has the real CK on the server.
  if (res.status === 201) primeCK(conv.id, conv.currentKeyVersion ?? 1, ck);
  return conv;
};

/** Create a GROUP or CHANNEL, sealing a fresh CK to every initial member. */
export const createGroupOrChannel = async (
  selfId: string,
  name: string,
  memberIds: string[],
  type: 'GROUP' | 'CHANNEL' = 'GROUP',
) => {
  const allIds = Array.from(new Set([selfId, ...memberIds]));
  const members: MemberKey[] = await Promise.all(allIds.map(fetchMemberKey));
  const ck = generateCK();
  const wrappedKeys = sealCKToMembers(ck, members);
  const res = await api.post('/conversations', { type, name, memberIds, wrappedKeys });
  const conv = res.data;
  primeCK(conv.id, conv.currentKeyVersion ?? 1, ck);
  return conv;
};

/** Add members to a group/channel, sealing the CURRENT CK to each new member. */
export const addMembersWithKey = async (
  conversationId: string,
  currentVersion: number,
  newMemberIds: string[],
) => {
  const ck = await getCK(conversationId, currentVersion);
  const keys = await Promise.all(newMemberIds.map(fetchMemberKey));
  const members = sealCKToMembers(ck, keys);
  const res = await api.post(`/conversations/${conversationId}/members`, { members });
  return res.data;
};

/**
 * Remove a member and rotate the CK forward: a NEW key sealed to every remaining
 * member so the removed member cannot read future messages.
 */
export const removeMemberWithRotation = async (
  conversationId: string,
  removeUserId: string,
  remainingMemberIds: string[],
) => {
  const newCk = generateCK();
  const keys = await Promise.all(remainingMemberIds.map(fetchMemberKey));
  const rotationKeys = sealCKToMembers(newCk, keys);
  const res = await api.delete(`/conversations/${conversationId}/members/${removeUserId}`, {
    data: { rotation: { keys: rotationKeys } },
  });
  return res.data;
};
