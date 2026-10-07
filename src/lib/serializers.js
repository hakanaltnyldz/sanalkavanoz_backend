export function serializeUser(user, presenceStore = null) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    isOnline: presenceStore ? presenceStore.isOnline(user.id) : false,
    isTyping: presenceStore ? presenceStore.isTyping(user.id) : false,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
  };
}

// Baskalarina gosterilen profil: e-posta gibi ozel alanlar yok.
export function serializePublicUser(user) {
  return {
    id: user.id,
    username: user.username ?? null,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export function serializeCouple(membership, presenceStore = null) {
  if (!membership) {
    return null;
  }

  const members = membership.couple.memberships.map((member) => ({
    nickname: member.nickname ?? null,
    joinedAt: member.joinedAt.toISOString(),
    user: serializeUser(member.user, presenceStore),
  }));

  const partner = membership.couple.memberships.find((member) => member.userId !== membership.userId);

  return {
    id: membership.couple.id,
    name: membership.couple.name ?? null,
    inviteCode: membership.couple.inviteCode,
    startDate: membership.couple.startDate ? membership.couple.startDate.toISOString() : null,
    createdAt: membership.couple.createdAt.toISOString(),
    updatedAt: membership.couple.updatedAt.toISOString(),
    partner: partner
      ? {
          nickname: partner.nickname ?? null,
          joinedAt: partner.joinedAt.toISOString(),
          user: serializeUser(partner.user, presenceStore),
        }
      : null,
    members,
  };
}

export function serializePartnerRequest(request) {
  return {
    id: request.id,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    respondedAt: request.respondedAt ? request.respondedAt.toISOString() : null,
    fromUser: request.fromUser ? serializePublicUser(request.fromUser) : null,
    toUser: request.toUser ? serializePublicUser(request.toUser) : null,
  };
}

export function serializeMessage(message) {
  return {
    id: message.id,
    coupleId: message.coupleId,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId ?? null,
    type: message.type,
    text: message.text ?? null,
    mediaUrl: message.mediaUrl ?? null,
    mediaMimeType: message.mediaMimeType ?? null,
    voiceDurationSeconds: message.voiceDurationSeconds ?? null,
    replyToMessageId: message.replyToMessageId ?? null,
    deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
    readAt: message.readAt ? message.readAt.toISOString() : null,
    deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    sender: message.sender
      ? {
          id: message.sender.id,
          username: message.sender.username ?? null,
          displayName: message.sender.displayName,
          avatarUrl: message.sender.avatarUrl ?? null,
        }
      : null,
    replyToMessage: message.replyToMessage
      ? {
          id: message.replyToMessage.id,
          type: message.replyToMessage.type,
          text: message.replyToMessage.text ?? null,
          mediaUrl: message.replyToMessage.mediaUrl ?? null,
          createdAt: message.replyToMessage.createdAt.toISOString(),
        }
      : null,
  };
}
