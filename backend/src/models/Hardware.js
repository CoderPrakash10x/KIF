const mongoose = require('mongoose');
const { HARDWARE_CONDITION } = require('../constants/enums');

const hardwareSchema = new mongoose.Schema(
  {
    assetTag: {
      type: String,
      unique: true,
      sparse: true, // quantity-based bulk items may not have individual asset tags
      trim: true,
    },

    itemName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true }, // e.g. Microcontrollers, Laptops, 3D Printers

    type: {
      type: String,
      enum: ['QUANTITY_BASED', 'ASSET_BASED'],
      required: true,
    },

    serialNumber: { type: String, trim: true }, // relevant for ASSET_BASED items

    totalQuantity: { type: Number, required: true, min: 0, default: 1 },
    availableQuantity: { type: Number, required: true, min: 0, default: 1 },

    condition: {
      type: String,
      enum: Object.values(HARDWARE_CONDITION),
      default: HARDWARE_CONDITION.WORKING,
    },

    location: { type: String, trim: true },
    description: { type: String, trim: true },

    imageUrl: { type: String }, // Cloudinary

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hardwareSchema.index({ category: 1 });
hardwareSchema.index({ itemName: 'text', description: 'text' }); // search support

// Guard: available can never exceed total
hardwareSchema.pre('validate', function () {
  if (this.availableQuantity > this.totalQuantity) {
    throw new Error('availableQuantity cannot exceed totalQuantity');
  }
});

module.exports = mongoose.model('Hardware', hardwareSchema);