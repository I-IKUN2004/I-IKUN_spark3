// ==========================================
// IK-Core Economy Module (Native LLSE Version)
// Author:铭记mingji  I IKUN2004
// ==========================================

class gmoney {

    constructor(type, object = "") {
        this.type = type;
        this.object = object;
    }

    _getUUID(xuid) {
        return data.xuid2uuid(xuid);
    }

    set(xuid, value) {

        if (!xuid) return false;

        if (this.type == "llmoney") {
            return money.set(xuid, value);
        } else if (this.type == "score") {
            const uuid = this._getUUID(xuid);
            if (!uuid) return false;
            return mc.setPlayerScore(uuid, this.object, value);
        }
    }

    add(xuid, value) {
        if (!xuid) return false;

        if (this.type == "llmoney") {
            return money.add(xuid, value);
        } else if (this.type == "score") {
            const uuid = this._getUUID(xuid);
            if (!uuid) return false;
            return mc.addPlayerScore(uuid, this.object, value);
        }
    }

    reduce(xuid, value) {
        if (!xuid) return false;

        if (this.type == "llmoney") {
            return money.reduce(xuid, value);
        } else if (this.type == "score") {
            const uuid = this._getUUID(xuid);
            if (!uuid) return false;
            return mc.reducePlayerScore(uuid, this.object, value);
        }
    }

    trans(xuid1, xuid2, value, PayNote) {
        if (!xuid1 || !xuid2) return false;

        if (this.type == "llmoney") {
            return money.trans(xuid1, xuid2, value, PayNote);
        } else if (this.type == "score") {
            const uuid1 = this._getUUID(xuid1);
            const uuid2 = this._getUUID(xuid2);
            
            if (!uuid1 || !uuid2) return false;

            const reduceSuccess = mc.reducePlayerScore(uuid1, this.object, value);
            if (reduceSuccess) {
                const addSuccess = mc.addPlayerScore(uuid2, this.object, value);
                if (!addSuccess) {

                    mc.addPlayerScore(uuid1, this.object, value);
                    return false;
                }
                return true;
            }
            return false;
        }
    }

    get(xuid) {
        if (!xuid) return 0;

        switch (this.type) {
            case "score": {
                const uuid = this._getUUID(xuid);
                if (!uuid) return 0; 
                return mc.getPlayerScore(uuid, this.object);
            }
            case "llmoney": {
                return money.get(xuid);
            }
            default:
                return 0;
        }
    }
}

module.exports = gmoney;