#ifndef MODE_SETTER_H
#define MODE_SETTER_H

#ifdef __cplusplus
extern "C" {
#endif

// Define an enum for the different modes
typedef enum{
    MODE_0,
    MODE_1,
    MODE_2,
    MODE_3
}EbyteMode;

void setMode(EbyteMode mode);

void _mode_0(void);
void _mode_1(void);
void _mode_2(void);
void _mode_3(void);

#ifdef __cplusplus
}
#endif

#endif