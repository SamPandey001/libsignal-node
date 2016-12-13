
const SessionLock = require('./session_lock.js');
const SessionRecord = require('./session_record.js');
const BaseKeyType = require('./base_key_type.js');
const ChainType = require('./chain_type.js');
const crypto = require('./crypto.js');
const helpers = require('./helpers.js');


function SessionBuilder(storage, remoteAddress) {
  this.remoteAddress = remoteAddress;
  this.storage = storage;
}

SessionBuilder.prototype = {
  processPreKey: function(device) {
    return SessionLock.queueJobForNumber(this.remoteAddress.toString(), function() {
      return this.storage.isTrustedIdentity(
          this.remoteAddress.getName(), device.identityKey
      ).then(function(trusted) {
        if (!trusted) {
          throw new Error('Identity key changed');
        }

        console.log('llllllllll');
        return crypto.Ed25519Verify(
          device.identityKey,
          device.signedPreKey.publicKey,
          device.signedPreKey.signature
        );
      }).then(function() {
        return crypto.createKeyPair();
      }).then(function(baseKey) {
        var devicePreKey = (device.preKey.publicKey);
        return this.initSession(true, baseKey, undefined, device.identityKey,
          devicePreKey, device.signedPreKey.publicKey
        ).then(function(session) {
            session.pendingPreKey = {
                preKeyId    : device.preKey.keyId,
                signedKeyId : device.signedPreKey.keyId,
                baseKey     : baseKey.pubKey
            };
            return session;
        });
      }.bind(this)).then(function(session) {
        var address = this.remoteAddress.toString();
        return this.storage.loadSession(address).then(function(serialized) {
          var record;
          if (serialized !== undefined) {
            record = SessionRecord.deserialize(serialized);
          } else {
            record = new SessionRecord(device.identityKey, device.registrationId);
          }

          record.archiveCurrentState();
          record.updateSessionState(session, device.registrationId);
          return Promise.all([
            this.storage.storeSession(address, record.serialize()),
            this.storage.saveIdentity(this.remoteAddress.getName(), record.identityKey)
          ]);
        }.bind(this));
      }.bind(this));
    }.bind(this));
  },
  processV3: function(record, message) {
    var preKeyPair, signedPreKeyPair, session;
let i = 0;
console.log("XXX33", i++);
    return this.storage.isTrustedIdentity(
        this.remoteAddress.getName(), message.identityKey.toArrayBuffer()
    ).then(function(trusted) {
console.log("XX23X", i++);
        if (!trusted) {
            var e = new Error('Unknown identity key');
            e.identityKey = message.identityKey.toArrayBuffer();
            throw e;
        }
console.log("XXX3333", i++);
        return Promise.all([
            this.storage.loadPreKey(message.preKeyId),
            this.storage.loadSignedPreKey(message.signedPreKeyId),
        ]).then(function(results) {
console.log("XXXasdf", i++);
            preKeyPair       = results[0];
            signedPreKeyPair = results[1];
        });
    }.bind(this)).then(function() {
console.log("asdfXXX", i++);
        session = record.getSessionByBaseKey(message.baseKey);
console.log("JJXXX", i++);
        if (session) {
          console.log("Duplicate PreKeyMessage for session");
          return;
        }
console.log("JJ", i++);

        session = record.getOpenSession();

        if (signedPreKeyPair === undefined) {
            // Session may or may not be the right one, but if its not, we
            // can't do anything about it ...fall through and let
            // decryptWhisperMessage handle that case
            if (session !== undefined && session.currentRatchet !== undefined) {
                return;
            } else {
                throw new Error("Missing Signed PreKey for PreKeyWhisperMessage");
            }
        }

console.log("lasdf", i++);
        if (session !== undefined) {
            record.archiveCurrentState();
        }
console.log("dd", i++);
        if (message.preKeyId && !preKeyPair) {
            console.log('Invalid prekey id', message.preKeyId);
        }
console.log("cc", i++);
        return this.initSession(false, preKeyPair, signedPreKeyPair,
            message.identityKey.toArrayBuffer(),
            message.baseKey.toArrayBuffer(), undefined
        ).then(function(new_session) {
            // Note that the session is not actually saved until the very
            // end of decryptWhisperMessage ... to ensure that the sender
            // actually holds the private keys for all reported pubkeys
console.log("lsdfksdfasdf", i++);
            record.updateSessionState(new_session, message.registrationId);
            return this.storage.saveIdentity(this.remoteAddress.getName(), message.identityKey.toArrayBuffer()).then(function() {

console.log("lsdfsidasdfasdfksdfasdf", i++);
              return message.preKeyId;
            });
        }.bind(this));
    }.bind(this));
  },

  initSession: function(isInitiator, ourEphemeralKey, ourSignedKey,
                   theirIdentityPubKey, theirEphemeralPubKey,
                   theirSignedPubKey) {
console.log("lsdasdfasdffksdfasdf");
    return this.storage.getIdentityKeyPair().then(function(ourIdentityKey) {
console.log("lsdaffksdfasdf", ourIdentityKey);
        if (isInitiator) {
            if (ourSignedKey !== undefined) {
                throw new Error("Invalid call to initSession");
            }
            ourSignedKey = ourEphemeralKey;
        } else {
            if (theirSignedPubKey !== undefined) {
                throw new Error("Invalid call to initSession");
            }
            theirSignedPubKey = theirEphemeralPubKey;
        }

console.log("lasd33333sdaffksdfasdf");
        var sharedSecret;
        if (ourEphemeralKey === undefined || theirEphemeralPubKey === undefined) {
            sharedSecret = new Uint8Array(32 * 4);
        } else {
            sharedSecret = new Uint8Array(32 * 5);
        }

console.log("lasdfsadfasd33333sdaffksdfasdf");
        for (var i = 0; i < 32; i++) {
            sharedSecret[i] = 0xff;
        }

console.log("lasdfsadasdfasdffasd33333sdaffksdfasdf", theirIdentityPubKey, ourSignedKey.privKey);
        return Promise.all([
            crypto.calculateAgreement(theirSignedPubKey, ourIdentityKey.privKey),
            crypto.calculateAgreement(theirIdentityPubKey, ourSignedKey.privKey),
            crypto.calculateAgreement(theirSignedPubKey, ourSignedKey.privKey)
        ]).then(function(ecRes) {
            if (isInitiator) {
                sharedSecret.set(new Uint8Array(ecRes[0]), 32);
                sharedSecret.set(new Uint8Array(ecRes[1]), 32 * 2);
            } else {
                sharedSecret.set(new Uint8Array(ecRes[0]), 32 * 2);
                sharedSecret.set(new Uint8Array(ecRes[1]), 32);
            }
            sharedSecret.set(new Uint8Array(ecRes[2]), 32 * 3);

            if (ourEphemeralKey !== undefined && theirEphemeralPubKey !== undefined) {
                return crypto.calculateAgreement(
                    theirEphemeralPubKey, ourEphemeralKey.privKey
                ).then(function(ecRes4) {
                    sharedSecret.set(new Uint8Array(ecRes4), 32 * 4);
                });
            }
        }).then(function() {
            // XXX
            console.log("laasdfasdfasdfasdfasdfXXXXXsdfsadasdfasdffasd33333sdaffksdfasdf");
            return crypto.HKDF(sharedSecret.buffer, new ArrayBuffer(32), "WhisperText");
        }).then(function(masterKey) {
            var session = {
                currentRatchet: {
                    rootKey                : masterKey[0],
                    lastRemoteEphemeralKey : theirSignedPubKey,
                    previousCounter        : 0
                },
                indexInfo: {
                    remoteIdentityKey : theirIdentityPubKey,
                    closed            : -1
                },
                oldRatchetList: []
            };

            // If we're initiating we go ahead and set our first sending ephemeral key now,
            // otherwise we figure it out when we first maybeStepRatchet with the remote's ephemeral key
            if (isInitiator) {
                session.indexInfo.baseKey = ourEphemeralKey.pubKey;
                session.indexInfo.baseKeyType = BaseKeyType.OURS;
                return crypto.createKeyPair().then(function(ourSendingEphemeralKey) {
                    session.currentRatchet.ephemeralKeyPair = ourSendingEphemeralKey;
                    return this.calculateSendingRatchet(session, theirSignedPubKey).then(function() {
                        return session;
                    });
                }.bind(this));
            } else {
                session.indexInfo.baseKey = theirEphemeralPubKey;
                session.indexInfo.baseKeyType = BaseKeyType.THEIRS;
                session.currentRatchet.ephemeralKeyPair = ourSignedKey;
                return session;
            }
        }.bind(this));
    }.bind(this));
  },
  calculateSendingRatchet: function(session, remoteKey) {
      var ratchet = session.currentRatchet;

      return crypto.calculateAgreement(
          remoteKey, helpers.toArrayBuffer(ratchet.ephemeralKeyPair.privKey)
      ).then(function(sharedSecret) {
            // XXX
          return crypto.HKDF(
              sharedSecret, helpers.toArrayBuffer(ratchet.rootKey), "WhisperRatchet"
          );
      }).then(function(masterKey) {
          session[helpers.toString(ratchet.ephemeralKeyPair.pubKey)] = {
              messageKeys : {},
              chainKey    : { counter : -1, key : masterKey[1] },
              chainType   : ChainType.SENDING
          };
          ratchet.rootKey = masterKey[0];
      });
  }

};

module.exports = function (storage, remoteAddress) {
  var builder = new SessionBuilder(storage, remoteAddress);
  this.processPreKey = builder.processPreKey.bind(builder);
  this.processV3 = builder.processV3.bind(builder);
};